import { useState, useRef, useCallback } from 'react'
import { computeSummary, computeUrlState, EMPTY_SUMMARY } from '../../../shared/types.js'
import { getScanResults } from '../../../shared/storage.js'
import {
  getAllResults, saveResults,
  getMeta, setMeta,
  getAllUrlList, saveUrlList,
  appendScanHistory, getScanHistory,
} from '../../../shared/db.js'
import { pullFromSheets, pushToSheets } from '../../../shared/sheetsSync.js'
import { fetchAllUrls, checkUrl, runConcurrent, prefetchBrandData } from '../utils/urlChecker.js'

const INITIAL_STATE = {
  status: 'idle',
  progress: { total: 0, completed: 0, brandsFetched: 0, brandsTotal: 0 },
  results: [],
  summary: EMPTY_SUMMARY,
  lastScannedAt: null,
  urlListFetchedAt: null,
  sheetsSyncing: false,
  sheetsLastSyncAt: null,
  error: undefined,
  delta: null,          // { newFailures, recovered, newUrls } — shown after scan
  scanHistory: [],      // last 5 scan records
  isPartial: false,     // true if last scan was stopped early
}

const BATCH_INTERVAL_MS = 250

function firstPathSegment(url) {
  try {
    const { pathname } = new URL(url)
    return pathname.split('/').filter(Boolean)[0] ?? ''
  } catch {
    return ''
  }
}

function mergeResults(local, remote) {
  const map = new Map(local.map((r) => [r.url, r]))
  for (const r of remote) {
    const existing = map.get(r.url)
    if (!existing || r.checkedAt > (existing.checkedAt ?? 0)) {
      map.set(r.url, r)
    }
  }
  return [...map.values()]
}

// Compute what changed between two result sets (prev → next).
function computeDelta(prevResults, nextResults) {
  const prevMap = new Map(prevResults.map((r) => [r.url, r]))
  const delta = { newFailures: [], recovered: [], newUrls: [] }
  const failed = new Set(['failed', 'timeout'])

  for (const r of nextResults) {
    const prev = prevMap.get(r.url)
    if (!prev) {
      delta.newUrls.push({ url: r.url, group: r.group })
    } else if (!failed.has(prev.group) && failed.has(r.group)) {
      delta.newFailures.push({ url: r.url, group: r.group, statusCode: r.statusCode, errorReason: r.errorReason })
    } else if (failed.has(prev.group) && !failed.has(r.group)) {
      delta.recovered.push({ url: r.url, group: r.group, statusCode: r.statusCode })
    }
  }
  return delta
}

async function migrateIfNeeded() {
  try {
    const done = await getMeta('migrated_v1')
    if (done) return
    const { results } = await getScanResults()
    if (results.length > 0) await saveResults(results)
    await setMeta('migrated_v1', true)
  } catch {
    // best-effort
  }
}

async function pushToSheetsQuiet(sheetsId, results, tabName, onStart, onDone) {
  if (!sheetsId) return
  onStart?.()
  try {
    await pushToSheets(sheetsId, results, tabName)
    const syncAt = Date.now()
    await setMeta('sheetsLastSyncAt', syncAt)
    onDone?.(syncAt, null)
  } catch (err) {
    console.warn('[sheetsSync] push failed:', err.message)
    onDone?.(null, err)
  }
}

export function useScan() {
  const [state, setState] = useState(INITIAL_STATE)
  const abortRef = useRef(null)
  // Results stored as Map<url, result> during scan for O(1) updates
  const resultsMapRef = useRef(new Map())
  const batchTimerRef = useRef(null)
  const scanGenRef = useRef(0)

  const flushBatch = useCallback(() => {
    const results = [...resultsMapRef.current.values()]
    setState((prev) => ({
      ...prev,
      results,
      summary: computeSummary(results),
      progress: { ...prev.progress, completed: results.length },
    }))
  }, [])

  const loadFromStorage = useCallback(async (settings) => {
    await migrateIfNeeded()
    setState((prev) => ({ ...prev, status: 'loading' }))

    const now = Date.now()
    const thresholdMs = (settings.stalenessHours ?? 4) * 3600000

    let results = await getAllResults()
    const [urlListFetchedAt, sheetsLastSyncAt, lastScannedAt, history] = await Promise.all([
      getMeta('urlListFetchedAt'),
      getMeta('sheetsLastSyncAt'),
      getMeta('lastScannedAt'),
      getScanHistory(),
    ])

    results = results.map((r) => ({ ...r, urlState: computeUrlState(r, now, thresholdMs) }))

    setState({
      ...INITIAL_STATE,
      status: results.length > 0 ? 'complete' : 'idle',
      progress: { total: results.length, completed: results.length, brandsFetched: 0, brandsTotal: 0 },
      results,
      summary: computeSummary(results),
      lastScannedAt: lastScannedAt ?? null,
      urlListFetchedAt: urlListFetchedAt ?? null,
      sheetsLastSyncAt: sheetsLastSyncAt ?? null,
      scanHistory: history,
    })

    if (!settings.sheetsId) return

    setState((prev) => ({ ...prev, sheetsSyncing: true }))
    try {
      const sheetsResults = await pullFromSheets(settings.sheetsId, settings.sheetsTabName)
      const merged = mergeResults(results, sheetsResults).map((r) => ({
        ...r,
        urlState: computeUrlState(r, Date.now(), thresholdMs),
      }))
      await saveResults(merged)
      const syncAt = Date.now()
      await setMeta('sheetsLastSyncAt', syncAt)
      setState((prev) => ({
        ...prev,
        results: merged,
        summary: computeSummary(merged),
        sheetsSyncing: false,
        sheetsLastSyncAt: syncAt,
      }))
    } catch (err) {
      const isAuthExpired = err.message === 'AUTH_EXPIRED'
      console.warn('[sheetsSync] pull failed:', err.message)
      setState((prev) => ({
        ...prev,
        sheetsSyncing: false,
        sheetsAuthExpired: isAuthExpired,
      }))
    }
  }, [])

  const refreshUrlList = useCallback(async (settings) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setState((prev) => ({
      ...prev,
      status: 'fetching_urls',
      progress: { total: 0, completed: 0, brandsFetched: 0, brandsTotal: 0 },
      error: undefined,
    }))

    try {
      const tagged = await fetchAllUrls(settings, signal, (count) => {
        setState((prev) => ({ ...prev, progress: { ...prev.progress, total: count } }))
      })

      if (signal.aborted) return

      const now = Date.now()
      const thresholdMs = (settings.stalenessHours ?? 4) * 3600000
      const newUrlSet = new Set(tagged.map((t) => t.url))

      const [oldUrlList, currentResults] = await Promise.all([getAllUrlList(), getAllResults()])
      const oldUrlSet = new Set(oldUrlList.map((u) => u.url))
      const resultMap = new Map(currentResults.map((r) => [r.url, r]))

      for (const { url, id, source } of tagged) {
        if (!oldUrlSet.has(url) && !resultMap.has(url)) {
          resultMap.set(url, {
            url, id, eolType: '',
            deviceType: source === 1 ? 'devices' : 'accy',
            productType: firstPathSegment(url),
            brand: '', displayUrl: '', link: '', deviceId: '',
            statusCode: 0, statusText: '',
            group: 'pending', responseTime: 0, checkedAt: 0, urlState: 'new',
          })
        }
      }

      for (const { url } of oldUrlList) {
        if (!newUrlSet.has(url) && resultMap.has(url)) {
          resultMap.set(url, { ...resultMap.get(url), urlState: 'removed' })
        }
      }

      for (const { url } of tagged) {
        const r = resultMap.get(url)
        if (r && r.urlState !== 'new') {
          resultMap.set(url, { ...r, urlState: computeUrlState(r, now, thresholdMs) })
        }
      }

      const enrichedUrlList = tagged.map(({ url, id, source }) => ({
        url, id, source,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))
      const finalResults = [...resultMap.values()]

      await Promise.all([
        saveUrlList(enrichedUrlList),
        saveResults(finalResults),
        setMeta('urlListFetchedAt', now),
      ])

      setState((prev) => ({
        ...prev,
        status: 'complete',
        progress: { total: finalResults.length, completed: finalResults.length, brandsFetched: 0, brandsTotal: 0 },
        results: finalResults,
        summary: computeSummary(finalResults),
        urlListFetchedAt: now,
      }))
    } catch (err) {
      if (signal.aborted) return
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  const startScan = useCallback(async (settings) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    resultsMapRef.current = new Map()
    const scanGen = ++scanGenRef.current
    const signal = abortRef.current.signal
    const startedAt = Date.now()

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    setState((prev) => ({
      ...INITIAL_STATE,
      status: 'fetching_urls',
      sheetsLastSyncAt: prev.sheetsLastSyncAt,
      urlListFetchedAt: prev.urlListFetchedAt,
      lastScannedAt: prev.lastScannedAt,
      scanHistory: prev.scanHistory,
    }))

    // Load previous results before scan so we can compute delta afterward
    const prevResults = await getAllResults()

    try {
      const tagged = await fetchAllUrls(settings, signal, (fetched) => {
        setState((prev) => ({ ...prev, progress: { ...prev.progress, total: fetched } }))
      })
      if (signal.aborted) return

      const now = Date.now()
      const enrichedUrlList = tagged.map(({ url, id, source }) => ({
        url, id, source,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))
      await Promise.all([saveUrlList(enrichedUrlList), setMeta('urlListFetchedAt', now)])

      // Pre-fetch all brand data in batches before starting scan
      setState((prev) => ({
        ...prev,
        status: 'fetching_brands',
        progress: { ...prev.progress, brandsTotal: tagged.length, brandsFetched: 0 },
      }))

      const brandMap = await prefetchBrandData(
        settings.apiEndpoint,
        tagged,
        signal,
        (fetched, total) => {
          setState((prev) => ({
            ...prev,
            progress: { ...prev.progress, brandsFetched: fetched, brandsTotal: total },
          }))
        }
      )

      if (signal.aborted) return

      const enriched = tagged.map(({ url, id, source }) => ({
        url, id,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))

      setState((prev) => ({
        ...prev,
        status: 'scanning',
        progress: { total: enriched.length, completed: 0, brandsFetched: 0, brandsTotal: 0 },
        urlListFetchedAt: now,
      }))

      await runConcurrent(
        enriched,
        settings.concurrency,
        ({ url, id, deviceType, productType }) => {
          const brandData = brandMap.get(id) ?? null
          return checkUrl(url, settings.timeoutMs, signal, brandData)
        },
        (result, { id, deviceType, productType }) => {
          if (scanGenRef.current !== scanGen) return
          resultsMapRef.current.set(result.url, {
            deviceType, productType, eolType: '',
            ...result,
            id,
            urlState: 'fresh',
          })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)

      const scannedAt = Date.now()
      const finalResults = [...resultsMapRef.current.values()]
      const delta = computeDelta(prevResults, finalResults)
      const summary = computeSummary(finalResults)

      const historyRecord = {
        scanId: `scan-${startedAt}`,
        startedAt,
        completedAt: scannedAt,
        isPartial: signal.aborted,
        summary,
        delta: {
          newFailures: delta.newFailures.slice(0, 100),
          recovered: delta.recovered.slice(0, 100),
          newUrls: delta.newUrls.slice(0, 100),
        },
      }

      await Promise.all([
        saveResults(finalResults),
        setMeta('lastScannedAt', scannedAt),
        appendScanHistory(historyRecord),
      ])

      const history = await getScanHistory()

      setState((prev) => ({
        ...prev,
        status: signal.aborted ? 'stopped' : 'complete',
        progress: { total: enriched.length, completed: finalResults.length, brandsFetched: 0, brandsTotal: 0 },
        results: finalResults,
        summary,
        lastScannedAt: scannedAt,
        delta: signal.aborted ? null : delta,
        scanHistory: history,
        isPartial: signal.aborted,
      }))

      if (!signal.aborted && (settings.autoSyncSheets !== false) && settings.sheetsId) {
        pushToSheetsQuiet(
          settings.sheetsId, finalResults, settings.sheetsTabName,
          () => setState((prev) => ({ ...prev, sheetsSyncing: true })),
          (syncAt, err) => setState((prev) => ({
            ...prev,
            sheetsSyncing: false,
            sheetsLastSyncAt: err ? prev.sheetsLastSyncAt : syncAt,
          }))
        )
      }
    } catch (err) {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      setState((prev) => ({
        ...prev,
        status: signal.aborted ? 'stopped' : 'error',
        error: signal.aborted ? undefined : (err instanceof Error ? err.message : 'Unknown error'),
        isPartial: true,
      }))
    }
  }, [flushBatch])

  const stopScan = useCallback(() => {
    abortRef.current?.abort()
    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    flushBatch()
    setState((prev) => ({ ...prev, status: 'stopped', isPartial: true }))
  }, [flushBatch])

  const recheckFailed = useCallback(async (settings) => {
    const items = state.results
      .filter((r) => r.group === 'failed' || r.group === 'timeout')
      .map((r) => ({ url: r.url, id: r.id ?? '', deviceType: r.deviceType ?? '', productType: r.productType ?? '' }))
    if (items.length === 0) return
    const base = state.results.filter((r) => r.group !== 'failed' && r.group !== 'timeout')
    await runRecheck(items, base, settings)
  }, [state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  const recheckSelected = useCallback(async (selectedUrls, settings) => {
    if (selectedUrls.size === 0) return
    const items = state.results
      .filter((r) => selectedUrls.has(r.url))
      .map((r) => ({ url: r.url, id: r.id ?? '', deviceType: r.deviceType ?? '', productType: r.productType ?? '' }))
    if (items.length === 0) return
    const base = state.results.filter((r) => !selectedUrls.has(r.url))
    await runRecheck(items, base, settings)
  }, [state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check a list of raw URLs pasted by the user
  const recheckPasted = useCallback(async (urls, settings) => {
    if (urls.length === 0) return
    const urlSet = new Set(urls)
    const resultByUrl = new Map(state.results.map((r) => [r.url, r]))
    const items = urls.map((url) => {
      const existing = resultByUrl.get(url)
      return {
        url,
        id: existing?.id ?? '',
        deviceType: existing?.deviceType ?? '',
        productType: existing?.productType ?? '',
      }
    })
    const base = state.results.filter((r) => !urlSet.has(r.url))
    await runRecheck(items, base, settings)
  }, [state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runRecheck(itemsToCheck, baseResults, settings) {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    const scanGen = ++scanGenRef.current

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    resultsMapRef.current = new Map(baseResults.map((r) => [r.url, r]))

    setState((prev) => ({
      ...prev,
      status: 'scanning',
      progress: { total: prev.results.length, completed: baseResults.length, brandsFetched: 0, brandsTotal: 0 },
      delta: null,
    }))

    // Pre-fetch brand data for items being rechecked
    const brandMap = await prefetchBrandData(settings.apiEndpoint, itemsToCheck, signal)

    try {
      await runConcurrent(
        itemsToCheck,
        settings.concurrency,
        ({ url, id, deviceType, productType }) => {
          const brandData = brandMap.get(id) ?? null
          return checkUrl(url, settings.timeoutMs, signal, brandData)
        },
        (result, { id, deviceType, productType }) => {
          if (scanGenRef.current !== scanGen) return
          resultsMapRef.current.set(result.url, {
            deviceType, productType, eolType: '',
            ...result,
            id,
            urlState: 'fresh',
          })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      const scannedAt = Date.now()
      const finalResults = [...resultsMapRef.current.values()]
      await Promise.all([saveResults(finalResults), setMeta('lastScannedAt', scannedAt)])

      setState((prev) => ({
        ...prev,
        status: 'complete',
        progress: { total: finalResults.length, completed: finalResults.length, brandsFetched: 0, brandsTotal: 0 },
        results: finalResults,
        summary: computeSummary(finalResults),
        lastScannedAt: scannedAt,
      }))

      if (!signal.aborted && (settings.autoSyncSheets !== false) && settings.sheetsId) {
        pushToSheetsQuiet(
          settings.sheetsId, finalResults, settings.sheetsTabName,
          () => setState((prev) => ({ ...prev, sheetsSyncing: true })),
          (syncAt, err) => setState((prev) => ({
            ...prev,
            sheetsSyncing: false,
            sheetsLastSyncAt: err ? prev.sheetsLastSyncAt : syncAt,
          }))
        )
      }
    } catch {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      flushBatch()
      setState((prev) => ({ ...prev, status: 'stopped' }))
    }
  }

  const syncToSheets = useCallback(async (settings) => {
    if (!settings.sheetsId || state.results.length === 0 || state.sheetsSyncing) return
    pushToSheetsQuiet(
      settings.sheetsId, state.results, settings.sheetsTabName,
      () => setState((prev) => ({ ...prev, sheetsSyncing: true })),
      (syncAt, err) => setState((prev) => ({
        ...prev,
        sheetsSyncing: false,
        sheetsLastSyncAt: err ? prev.sheetsLastSyncAt : syncAt,
      }))
    )
  }, [state.results, state.sheetsSyncing]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissDelta = useCallback(() => {
    setState((prev) => ({ ...prev, delta: null }))
  }, [])

  return {
    state,
    loadFromStorage,
    refreshUrlList,
    startScan,
    stopScan,
    recheckFailed,
    recheckSelected,
    recheckPasted,
    syncToSheets,
    dismissDelta,
  }
}
