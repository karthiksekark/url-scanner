import { useState, useRef, useCallback, useEffect } from 'react'
import { computeSummary, EMPTY_SUMMARY } from '../../../shared/types.js'
import { getScanResults, saveScanResults } from '../../../shared/storage.js'
import { fetchAllUrls, checkUrl, runConcurrent } from '../utils/urlChecker.js'

const INITIAL_STATE = {
  status: 'idle',
  progress: { total: 0, completed: 0 },
  results: [],
  summary: EMPTY_SUMMARY,
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

export function useScan() {
  const [state, setState] = useState(INITIAL_STATE)
  const abortRef = useRef(null)
  const resultsRef = useRef([])
  const batchTimerRef = useRef(null)

  useEffect(() => {
    getScanResults().then(({ results, scannedAt }) => {
      if (results.length > 0) {
        setState((prev) => {
          // Don't overwrite if a scan has already started
          if (prev.status !== 'idle') return prev
          return {
            status: 'complete',
            progress: { total: results.length, completed: results.length },
            results,
            summary: computeSummary(results),
            lastScannedAt: scannedAt,
          }
        })
      }
    })
  }, [])

  const flushBatch = useCallback(() => {
    const results = [...resultsRef.current]
    setState((prev) => ({
      ...prev,
      results,
      summary: computeSummary(results),
      progress: { ...prev.progress, completed: results.length },
    }))
  }, [])

  const startScan = useCallback(async (settings) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    resultsRef.current = []

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    setState({
      status: 'fetching_urls',
      progress: { total: 0, completed: 0 },
      results: [],
      summary: EMPTY_SUMMARY,
    })

    const signal = abortRef.current.signal

    try {
      const tagged = await fetchAllUrls(settings, signal, (fetched) => {
        setState((prev) => ({ ...prev, progress: { total: fetched, completed: 0 } }))
      })

      if (signal.aborted) return

      const enriched = tagged.map(({ url, source }) => ({
        url,
        deviceType: source === 1 ? 'devices' : 'accy',
        productType: firstPathSegment(url),
      }))

      setState((prev) => ({
        ...prev,
        status: 'scanning',
        progress: { total: enriched.length, completed: 0 },
      }))

      await runConcurrent(
        enriched,
        settings.concurrency,
        ({ url }) => checkUrl(url, settings.timeoutMs, signal),
        (result, { deviceType, productType }) => {
          resultsRef.current.push({ ...result, deviceType, productType })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)

      const finalResults = [...resultsRef.current]
      const scannedAt = Date.now()
      await saveScanResults(finalResults, scannedAt)

      setState({
        status: signal.aborted ? 'stopped' : 'complete',
        progress: { total: enriched.length, completed: finalResults.length },
        results: finalResults,
        summary: computeSummary(finalResults),
        lastScannedAt: scannedAt,
      })
    } catch (err) {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setState((prev) => ({
        ...prev,
        status: signal.aborted ? 'stopped' : 'error',
        error: signal.aborted ? undefined : errorMessage,
      }))
    }
  }, [flushBatch])

  const stopScan = useCallback(() => {
    abortRef.current?.abort()
    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    flushBatch()
    setState((prev) => ({ ...prev, status: 'stopped' }))
  }, [flushBatch])

  const recheckFailed = useCallback(async (settings) => {
    const failedItems = state.results
      .filter((r) => r.group === 'failed' || r.group === 'timeout')
      .map((r) => ({ url: r.url, deviceType: r.deviceType ?? '', productType: r.productType ?? '' }))

    if (failedItems.length === 0) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(flushBatch, BATCH_INTERVAL_MS)

    resultsRef.current = state.results.filter(
      (r) => r.group !== 'failed' && r.group !== 'timeout'
    )

    setState((prev) => ({
      ...prev,
      status: 'scanning',
      progress: { total: prev.results.length, completed: prev.results.length - failedItems.length },
    }))

    try {
      await runConcurrent(
        failedItems,
        settings.concurrency,
        ({ url }) => checkUrl(url, settings.timeoutMs, signal),
        (result, { deviceType, productType }) => {
          resultsRef.current.push({ ...result, deviceType, productType })
        },
        signal
      )

      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      const finalResults = [...resultsRef.current]
      const scannedAt = Date.now()
      await saveScanResults(finalResults, scannedAt)

      setState({
        status: 'complete',
        progress: { total: finalResults.length, completed: finalResults.length },
        results: finalResults,
        summary: computeSummary(finalResults),
        lastScannedAt: scannedAt,
      })
    } catch {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      flushBatch()
      setState((prev) => ({ ...prev, status: 'stopped' }))
    }
  }, [state.results, flushBatch])

  return { state, startScan, stopScan, recheckFailed }
}
