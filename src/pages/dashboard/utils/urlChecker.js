import * as XLSX from 'xlsx'
import { getStatusGroup } from '../../../shared/types.js'
import { getBrandCacheMap, saveBrandCacheEntries } from '../../../shared/db.js'

// Headers that make requests look like real browser navigation.
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

// HEAD status codes that reliably indicate the server doesn't support HEAD —
// fall back to GET only for these. All others (including 404) are trusted as-is.
const HEAD_FALLBACK_CODES = new Set([405, 429, 503])

const BRAND_BATCH_SIZE = 50
const RETRY_DELAY_MS = 1000

async function singleRequest(settings, payload, signal) {
  const headers = { 'Content-Type': 'application/json' }
  for (const { key, value } of settings.customHeaders) {
    if (key.trim()) headers[key.trim()] = value
  }

  let url, fetchOptions
  if (settings.method === 'POST') {
    url = settings.apiEndpoint
    fetchOptions = { method: 'POST', signal, credentials: 'include', headers, body: payload }
  } else {
    const endpoint = new URL(settings.apiEndpoint)
    try {
      const params = JSON.parse(payload || '{}')
      for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, String(v))
    } catch {
      // ignore invalid JSON, use endpoint as-is
    }
    url = endpoint.toString()
    fetchOptions = { method: 'GET', signal, credentials: 'include', headers }
  }

  const response = await fetch(url, fetchOptions)
  if (!response.ok) {
    throw new Error(`API returned ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Expected API response to be an object mapping URL paths to IDs.')
  }

  const base = (settings.siteBaseUrl ?? '').replace(/\/+$/, '')
  return Object.entries(data).map(([path, id]) => ({
    url: base + path,
    id: String(id),
  }))
}

export async function fetchAllUrls(settings, signal, onFetched) {
  const items1 = await singleRequest(settings, settings.payload1, signal)
  onFetched?.(items1.length)

  let items2 = []
  if (settings.enableRequest2 && !signal.aborted) {
    items2 = await singleRequest(settings, settings.payload2, signal)
    onFetched?.(items1.length + items2.length)
  }

  // Deduplicate by URL — first occurrence wins
  const seen = new Set()
  const all = [
    ...items1.map(({ url, id }) => ({ url, id, source: 1 })),
    ...items2.map(({ url, id }) => ({ url, id, source: 2 })),
  ]
  return all.filter(({ url }) => {
    if (seen.has(url)) return false
    seen.add(url)
    return true
  })
}

// ── Brand API (batch) ─────────────────────────────────────────────────────────

async function fetchBrandBatch(apiEndpoint, ids, signal) {
  if (!apiEndpoint || ids.length === 0) return new Map()
  try {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
      signal,
    })
    if (!res.ok) {
      console.warn(`[fetchBrandBatch] API returned ${res.status} for batch of ${ids.length}`)
      return new Map()
    }
    const data = await res.json()
    if (!Array.isArray(data)) return new Map()
    const result = new Map()
    for (const item of data) {
      if (!item?.id) continue
      result.set(String(item.id), normalizeBrandItem(item))
    }
    return result
  } catch (err) {
    if (!signal?.aborted) console.warn('[fetchBrandBatch] fetch failed:', err)
    return new Map()
  }
}

function normalizeBrandItem(item) {
  return {
    brand:       item.brandName   ? String(item.brandName)   : '',
    displayUrl:  item.url         ? String(item.url)         : '',
    link:        item.link        ? String(item.link)        : '',
    deviceType:  item.deviceType  ? String(item.deviceType)  : '',
    productType: item.productType ? String(item.productType) : '',
    deviceId:    item.deviceId    ? String(item.deviceId)    : '',
    eolType:     item.eolType     ? String(item.eolType)     : '',
  }
}

// Pre-fetch all brand data for a list of items, using IndexedDB cache (TTL 24h).
// Returns Map<id, brandData>. Never throws — failures return partial data.
export async function prefetchBrandData(apiEndpoint, items, signal, onProgress) {
  if (!apiEndpoint) return new Map()

  const ids = [...new Set(items.map((i) => i.id).filter(Boolean))]
  if (ids.length === 0) return new Map()

  // Load what we can from cache
  let cached = new Map()
  try {
    cached = await getBrandCacheMap(ids)
  } catch (err) {
    console.warn('[prefetchBrandData] cache read failed:', err)
  }

  const uncachedIds = ids.filter((id) => !cached.has(id))
  const freshEntries = []

  for (let i = 0; i < uncachedIds.length; i += BRAND_BATCH_SIZE) {
    if (signal?.aborted) break
    const batch = uncachedIds.slice(i, i + BRAND_BATCH_SIZE)
    const batchResult = await fetchBrandBatch(apiEndpoint, batch, signal)
    for (const [id, data] of batchResult) {
      cached.set(id, data)
      freshEntries.push({ id, ...data })
    }
    onProgress?.(Math.min(i + BRAND_BATCH_SIZE, uncachedIds.length), uncachedIds.length)
  }

  // Persist newly fetched entries to cache
  if (freshEntries.length > 0) {
    saveBrandCacheEntries(freshEntries).catch((err) =>
      console.warn('[prefetchBrandData] cache write failed:', err)
    )
  }

  return cached
}

// ── HTTP Checking ─────────────────────────────────────────────────────────────

function applyBrandData(result, brandData) {
  if (!brandData) return result
  return {
    ...result,
    brand:       brandData.brand       || result.brand       || '',
    displayUrl:  brandData.displayUrl  || result.displayUrl  || '',
    link:        brandData.link        || result.link        || '',
    deviceType:  brandData.deviceType  || result.deviceType  || '',
    productType: brandData.productType || result.productType || '',
    deviceId:    brandData.deviceId    || result.deviceId    || '',
    eolType:     brandData.eolType     || result.eolType     || '',
  }
}

function makeResult(url, statusCode, statusText, group, responseTime, errorReason) {
  return {
    url, statusCode, statusText, group, responseTime,
    checkedAt: Date.now(),
    brand: '', displayUrl: '', link: '', deviceType: '', productType: '', deviceId: '', eolType: '',
    ...(errorReason ? { errorReason } : {}),
  }
}

function classifyError(err, timeoutAborted, scanAborted) {
  if (scanAborted) return { text: 'Cancelled', reason: 'cancelled' }
  if (timeoutAborted) return { text: 'Timeout', reason: 'timeout' }
  const msg = err?.message ?? ''
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return { text: 'Network Error', reason: 'network' }
  if (msg.includes('CORS') || msg.includes('cors')) return { text: 'CORS Error', reason: 'cors' }
  if (msg.includes('SSL') || msg.includes('certificate')) return { text: 'SSL Error', reason: 'ssl' }
  return { text: 'Network Error', reason: 'network' }
}

// checkUrl: brandData is pre-fetched and passed in — no API call inside.
export async function checkUrl(url, timeoutMs, scanSignal, brandData = null) {
  if (scanSignal.aborted) {
    return applyBrandData(makeResult(url, 0, 'Cancelled', 'failed', 0, 'cancelled'), brandData)
  }

  // Retry up to 2 extra times on transient network/timeout failures
  for (let attempt = 0; attempt <= 2; attempt++) {
    const result = await attemptCheck(url, timeoutMs, scanSignal, brandData)
    if (result._retryable && attempt < 2 && !scanSignal.aborted) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      continue
    }
    const { _retryable, ...clean } = result
    return clean
  }
}

async function attemptCheck(url, timeoutMs, scanSignal, brandData) {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onScanAbort = () => timeoutController.abort()
  scanSignal.addEventListener('abort', onScanAbort, { once: true })

  const startTime = performance.now()
  let headResponseTime = 0

  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: timeoutController.signal,
      redirect: 'follow',
      credentials: 'include',
      headers: BROWSER_HEADERS,
    })
    headResponseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    // Only fall back to GET for codes where HEAD is known unreliable
    if (HEAD_FALLBACK_CODES.has(headResponse.status)) {
      return await attemptGet(url, timeoutMs, scanSignal, brandData, headResponseTime)
    }

    const group = getStatusGroup(headResponse.status, headResponse.redirected)
    const finalUrl = headResponse.redirected && headResponse.url !== url ? headResponse.url : undefined

    return applyBrandData({
      url,
      statusCode: headResponse.status,
      statusText: headResponse.statusText || defaultStatusText(headResponse.status),
      group,
      responseTime: headResponseTime,
      checkedAt: Date.now(),
      finalUrl,
    }, brandData)

  } catch (err) {
    const responseTime = headResponseTime || Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    const timeoutAborted = timeoutController.signal.aborted && !scanSignal.aborted
    const { text, reason } = classifyError(err, timeoutAborted, scanSignal.aborted)
    const group = timeoutAborted ? 'timeout' : 'failed'

    if (!timeoutAborted && !scanSignal.aborted) {
      console.warn('[checkUrl] HEAD failed:', url, reason, err?.message)
    }

    const result = applyBrandData(makeResult(url, 0, text, group, responseTime, reason), brandData)
    // Mark as retryable for network errors and timeouts (not cancellations)
    result._retryable = reason === 'network' || reason === 'timeout'
    return result
  }
}

async function attemptGet(url, timeoutMs, scanSignal, brandData, priorResponseTime) {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onScanAbort = () => timeoutController.abort()
  scanSignal.addEventListener('abort', onScanAbort, { once: true })
  const startTime = performance.now()

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: timeoutController.signal,
      redirect: 'follow',
      credentials: 'include',
      headers: BROWSER_HEADERS,
    })
    // Cancel body immediately — status is all we need.
    response.body?.cancel().catch(() => undefined)
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    const group = getStatusGroup(response.status, response.redirected)
    const finalUrl = response.redirected && response.url !== url ? response.url : undefined
    return applyBrandData({
      url,
      statusCode: response.status,
      statusText: response.statusText || defaultStatusText(response.status),
      group,
      responseTime,
      checkedAt: Date.now(),
      finalUrl,
    }, brandData)
  } catch (err) {
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)
    const timeoutAborted = timeoutController.signal.aborted && !scanSignal.aborted
    const { text, reason } = classifyError(err, timeoutAborted, scanSignal.aborted)
    const result = applyBrandData(
      makeResult(url, 0, text, timeoutAborted ? 'timeout' : 'failed', responseTime || priorResponseTime, reason),
      brandData
    )
    result._retryable = reason === 'network' || reason === 'timeout'
    return result
  }
}

// ── Concurrency ───────────────────────────────────────────────────────────────

export async function runConcurrent(items, concurrency, fn, onResult, signal) {
  let idx = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length && !signal.aborted) {
        const i = idx++
        const item = items[i]
        const result = await fn(item)
        onResult(result, item)
      }
    }
  )
  await Promise.all(workers)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultStatusText(code) {
  const map = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  }
  return map[code] ?? String(code)
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export function exportToCsv(results) {
  const header = [
    'URL', 'Display URL', 'Link', 'ID', 'Device ID',
    'Device Type', 'Product Type', 'Brand', 'EOL Type',
    'Status Code', 'Status Text', 'Group', 'Response Time (ms)',
    'Final URL', 'Checked At', 'URL State', 'Error Reason',
  ]
  const rows = results.map((r) => [
    r.url,
    r.displayUrl ?? '',
    r.link ?? '',
    r.id ?? '',
    r.deviceId ?? '',
    r.deviceType ?? '',
    r.productType ?? '',
    r.brand ?? '',
    r.eolType ?? '',
    String(r.statusCode || ''),
    r.statusText ?? '',
    r.group,
    String(r.responseTime),
    r.finalUrl ?? '',
    r.checkedAt ? new Date(r.checkedAt).toISOString() : '',
    r.urlState ?? '',
    r.errorReason ?? '',
  ])

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `url-scan-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── XLSX Export ───────────────────────────────────────────────────────────────

export function exportToXlsx(results) {
  const header = [
    'URL', 'Display URL', 'Link', 'ID', 'Device ID',
    'Device Type', 'Product Type', 'Brand', 'EOL Type',
    'Status Code', 'Status Text', 'Group', 'Response Time (ms)',
    'Final URL', 'Checked At', 'URL State', 'Error Reason',
  ]
  const rows = results.map((r) => [
    r.url,
    r.displayUrl ?? '',
    r.link ?? '',
    r.id ?? '',
    r.deviceId ?? '',
    r.deviceType ?? '',
    r.productType ?? '',
    r.brand ?? '',
    r.eolType ?? '',
    r.statusCode || '',
    r.statusText ?? '',
    r.group,
    r.responseTime,
    r.finalUrl ?? '',
    r.checkedAt ? new Date(r.checkedAt).toISOString() : '',
    r.urlState ?? '',
    r.errorReason ?? '',
  ])

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2', sqref: 'A2' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Results')
  XLSX.writeFile(wb, `url-scan-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`)
}
