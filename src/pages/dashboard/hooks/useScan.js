import { useState, useRef, useCallback } from 'react'
import { computeSummary, computeUrlState, EMPTY_SUMMARY } from '../../../shared/types.js'
import { getScanResults } from '../../../shared/storage.js'
import {
  getAllResults, saveResults,
  getMeta, setMeta,
  getAllUrlList, saveUrlList,
} from '../../../shared/db.js'
import { pullFromSheets, pushToSheets } from '../../../shared/sheetsSync.js'
import { fetchAllUrls, checkUrl, runConcurrent } from '../utils/urlChecker.js'

const INITIAL_STATE = {
  status: 'idle',
  progress: { total: 0, completed: 0 },
  results: [],
  summary: EMPTY_SUMMARY,
  lastScannedAt: null,
  urlListFetchedAt: null,
  sheetsSyncing: false,
  sheetsLastSyncAt: null,
  error: undefined,
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

// Keep the more recently checked result per URL when merging local + Sheets
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

// Non-blocking Sheets push — never throws, surfaces errors via callbacks
async function pushToSheetsQuiet(sheetsId, results, onStart, onDone) {
  if (!sheetsId) return
  onStart?.()
  try {
    await pushToSheets(sheetsId, results)
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
  const resultsRef = useRef([])
  const batchTimerRef = useRef(null)
  const scanGenRef = useRef(0)

  const flushBatch = useCallback(() => {
    const results = [...resultsRef.current]
    setState((prev) => ({
      ...prev,
      results,
      summary: computeSummary(results),
      progress: { ...prev.progress, completed: results.length },
    }))
  }, [])

  // Load cached results from IndexedDB; pull from Sheets in background if configured
  const loadFromStorage = useCallback(async (settings) => {
    await migrateIfNeeded()
    setState((prev) => ({ ...prev, status: 'loading' }))

    const now = Date.now()
    const thresholdMs = (settings.stalenessHours ?? 4) * 3600000

    let results = await getAllResults()
    const [urlListFetchedAt, sheetsLastSyncAt, lastScannedAt] = await Promise.all([
      getMeta('urlListFetchedAt'),
      getMeta('sheetsLastSyncAt'),
      getMeta('lastScannedAt'),
    ])

    results = results.map((r) => ({ ...r, urlState: computeUrlState(r, now, thresholdMs) }))

    setState({
      ...INITIAL_STATE,
      status: results.length > 0 ? 'complete' : 'idle',
      progress: { total: results.length, completed: results.length },
      results,
      summary: computeSummary(results),
      lastScannedAt: lastScannedAt ?? null,
      urlListFetchedAt: urlListFetchedAt ?? null,
      sheetsLastSyncAt: sheetsLastSyncAt ?? null,
    })

    if (!settings.sheetsId) return

    setState((prev) => ({ ...prev, sheetsSyncing: true }))
    try {
      const sheetsResults = await pullFromSheets(settings.sheetsId)
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
      console.warn('[sheetsSync] pull failed:', err.message)
      setState((prev) => ({ ...prev, sheetsSyncing: false }))
    }
  }, [])

  // Fetch URL list from API, diff against stored list, update display — no scan
  const refreshUrlList = useCallback(async (settings) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setState((prev) => ({
      ...prev,
      status: 'fetching_urls',
      progress: { total: 0, completed: 0 },
      error: undefined,
    }))

    try {
      const tagged = await fetchAllUrls(settings, signal, (count) => {
        setState((prev) => ({ ...prev, progress: { total: count, completed: 0 } }))
      })

      if (signal.aborted) return

      const now = Date.now()
      const thresholdMs = (settings.stalenessHours ?? 4) * 3600000
      const newUrlSet = new Set(tagged.map((t) => t.url))

      const [oldUrlList, currentResults] = await Promise.all([getAllUrlList(), getAllResults()])
      const oldUrlSet = new Set(oldUrlList.map((u) => u.url))
      const resultMap = new Map(currentResults.map((r) => [r.url, r]))

      // URLs new to the list that have no stored result → create pending placeholder
      for (const { url, id, source } of tagged) {
        if (!oldUrlSet.has(url) && !resultMap.has(url)) {
          resultMap.set(url, {
            url, id,
            deviceType: source === 1 ? 'devices' : 'accy',
            productType: firstPathSegment(url),
            brand: '', statusCode: 0, statusText: '',
            group: 'pending', responseTime: 0, checkedAt: 0, urlState: 'new',
          })
        }
      }

      // URLs that disappeared from the list → mark removed
      for (const { url } of oldUrlList) {
        if (!newUrlSet.has(url) && resultMap.has(url)) {
          resultMap.set(url, { ...resultMap.get(url), urlState: 'removed' })
        }
      }

      // Recompute staleness for URLs that are still in the list
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
        progress: { total: finalResults.length, completed: finalResults.length },
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

  // Full scan: fetch fresh URL list + scan every URL
  const startScan = useCallback(async (settings) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    resultsRef.current = []
    const scanGen = ++scanGenRef.current
    const signal = abortRef.current.signal

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    setState((prev) => ({
      ...INITIAL_STATE,
      status: 'fetching_urls',
      sheetsLastSyncAt: prev.sheetsLastSyncAt,
      urlListFetchedAt: prev.urlListFetchedAt,
      lastScannedAt: prev.lastScannedAt,
    }))

    try {
      const tagged = await fetchAllUrls(settings, signal, (fetched) => {
        setState((prev) => ({ ...prev, progress: { total: fetched, completed: 0 } }))
      })

      if (signal.aborted) return

      const now = Date.now()
      const enrichedUrlList = tagged.map(({ url, id, source }) => ({
        url, id, source,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))
      await Promise.all([saveUrlList(enrichedUrlList), setMeta('urlListFetchedAt', now)])

      const enriched = tagged.map(({ url, id, source }) => ({
        url, id,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))

      setState((prev) => ({
        ...prev,
        status: 'scanning',
        progress: { total: enriched.length, completed: 0 },
        urlListFetchedAt: now,
      }))

      await runConcurrent(
        enriched,
        settings.concurrency,
        ({ url, id }) => checkUrl(url, settings.timeoutMs, signal, settings.apiEndpoint, id),
        (result, { id, deviceType, productType }) => {
          if (scanGenRef.current !== scanGen) return
          resultsRef.current.push({ ...result, id, deviceType, productType, urlState: 'fresh' })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)

      const scannedAt = Date.now()
      const finalResults = [...resultsRef.current]
      await Promise.all([saveResults(finalResults), setMeta('lastScannedAt', scannedAt)])

      setState((prev) => ({
        ...prev,
        status: signal.aborted ? 'stopped' : 'complete',
        progress: { total: enriched.length, completed: finalResults.length },
        results: finalResults,
        summary: computeSummary(finalResults),
        lastScannedAt: scannedAt,
      }))

      if (!signal.aborted && settings.sheetsId) {
        pushToSheetsQuiet(
          settings.sheetsId, finalResults,
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
      }))
    }
  }, [flushBatch])

  const stopScan = useCallback(() => {
    abortRef.current?.abort()
    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    flushBatch()
    setState((prev) => ({ ...prev, status: 'stopped' }))
  }, [flushBatch])

  // Re-check only failed / timeout URLs
  const recheckFailed = useCallback(async (settings) => {
    const items = state.results
      .filter((r) => r.group === 'failed' || r.group === 'timeout')
      .map((r) => ({ url: r.url, id: r.id ?? '', deviceType: r.deviceType ?? '', productType: r.productType ?? '' }))

    if (items.length === 0) return
    const base = state.results.filter((r) => r.group !== 'failed' && r.group !== 'timeout')
    await runRecheck(items, base, settings)
  }, [state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check a specific set of URLs chosen by the user
  const recheckSelected = useCallback(async (selectedUrls, settings) => {
    if (selectedUrls.size === 0) return
    const items = state.results
      .filter((r) => selectedUrls.has(r.url))
      .map((r) => ({ url: r.url, id: r.id ?? '', deviceType: r.deviceType ?? '', productType: r.productType ?? '' }))

    if (items.length === 0) return
    const base = state.results.filter((r) => !selectedUrls.has(r.url))
    await runRecheck(items, base, settings)
  }, [state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shared scan loop for recheckFailed and recheckSelected
  async function runRecheck(itemsToCheck, baseResults, settings) {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    const scanGen = ++scanGenRef.current

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    resultsRef.current = [...baseResults]

    setState((prev) => ({
      ...prev,
      status: 'scanning',
      progress: { total: prev.results.length, completed: baseResults.length },
    }))

    try {
      await runConcurrent(
        itemsToCheck,
        settings.concurrency,
        ({ url, id }) => checkUrl(url, settings.timeoutMs, signal, settings.apiEndpoint, id),
        (result, { id, deviceType, productType }) => {
          if (scanGenRef.current !== scanGen) return
          resultsRef.current.push({ ...result, id, deviceType, productType, urlState: 'fresh' })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      const scannedAt = Date.now()
      const finalResults = [...resultsRef.current]
      await Promise.all([saveResults(finalResults), setMeta('lastScannedAt', scannedAt)])

      setState((prev) => ({
        ...prev,
        status: 'complete',
        progress: { total: finalResults.length, completed: finalResults.length },
        results: finalResults,
        summary: computeSummary(finalResults),
        lastScannedAt: scannedAt,
      }))

      if (!signal.aborted && settings.sheetsId) {
        pushToSheetsQuiet(
          settings.sheetsId, finalResults,
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

  // Manual "Sync to Sheets" — pushes current results immediately
  const syncToSheets = useCallback(async (settings) => {
    if (!settings.sheetsId || state.results.length === 0 || state.sheetsSyncing) return
    pushToSheetsQuiet(
      settings.sheetsId, state.results,
      () => setState((prev) => ({ ...prev, sheetsSyncing: true })),
      (syncAt, err) => setState((prev) => ({
        ...prev,
        sheetsSyncing: false,
        sheetsLastSyncAt: err ? prev.sheetsLastSyncAt : syncAt,
      }))
    )
  }, [state.results, state.sheetsSyncing]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    loadFromStorage,
    refreshUrlList,
    startScan,
    stopScan,
    recheckFailed,
    recheckSelected,
    syncToSheets,
  }
}
