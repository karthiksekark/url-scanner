import { getStatusGroup } from '../../../shared/types.js'

// Headers that make requests look like real browser navigation.
// Some servers/CDNs return different responses for requests missing Accept.
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

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

  // Response is { "/path": "id", ... }
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

  return [
    ...items1.map(({ url, id }) => ({ url, id, source: 1 })),
    ...items2.map(({ url, id }) => ({ url, id, source: 2 })),
  ]
}

// Fetch brand name for a given ID from the API endpoint.
// Returns '' on any failure so it never breaks the scan.
async function fetchBrand(apiEndpoint, id, signal) {
  if (!apiEndpoint || !id) return ''
  try {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
      signal,
    })
    if (!res.ok) {
      console.warn(`[fetchBrand] API returned ${res.status} for id=${id}`)
      return ''
    }
    const data = await res.json()
    return (Array.isArray(data) && data[0]?.brandName) ? String(data[0].brandName) : ''
  } catch (err) {
    console.warn('[fetchBrand] fetch failed:', err)
    return ''
  }
}

export async function checkUrl(url, timeoutMs, scanSignal, apiEndpoint, id) {
  if (scanSignal.aborted) {
    return { ...makeResult(url, 0, 'Cancelled', 'failed', 0), brand: '' }
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onScanAbort = () => timeoutController.abort()
  scanSignal.addEventListener('abort', onScanAbort, { once: true })

  const startTime = performance.now()
  let headResponseTime = 0

  try {
    // Run HEAD check and brand fetch concurrently
    const [headSettled, brandSettled] = await Promise.allSettled([
      fetch(url, { method: 'HEAD', signal: timeoutController.signal, redirect: 'follow', credentials: 'include', headers: BROWSER_HEADERS })
        .then((r) => { headResponseTime = Math.round(performance.now() - startTime); return r }),
      fetchBrand(apiEndpoint, id, timeoutController.signal),
    ])

    const brand = brandSettled.status === 'fulfilled' ? brandSettled.value : ''
    const responseTime = headResponseTime || Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    if (headSettled.status === 'rejected') {
      const isTimeout = timeoutController.signal.aborted && !scanSignal.aborted
      if (!isTimeout && !scanSignal.aborted) {
        console.error('[checkUrl] HEAD request failed:', url, headSettled.reason)
      }
      return {
        ...makeResult(url, 0,
          isTimeout ? 'Timeout' : scanSignal.aborted ? 'Cancelled' : 'Network Error',
          isTimeout ? 'timeout' : 'failed',
          responseTime),
        brand,
      }
    }

    const response = headSettled.value
    // Fall back to GET for any non-success HEAD response.
    // HEAD is unreliable on many servers: 4XX and 5XX from HEAD often don't
    // reflect the real page status — GET is the authoritative check.
    if (response.status < 200 || response.status >= 400) {
      return await checkUrlGet(url, timeoutMs, scanSignal, brand)
    }

    const group = getStatusGroup(response.status, response.redirected)
    const finalUrl = response.redirected && response.url !== url ? response.url : undefined

    return {
      url,
      statusCode: response.status,
      statusText: response.statusText || defaultStatusText(response.status),
      group,
      responseTime,
      checkedAt: Date.now(),
      finalUrl,
      brand,
    }
  } catch (err) {
    const responseTime = headResponseTime || Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)
    console.error('[checkUrl] Unexpected error:', url, err)

    const isTimeout = timeoutController.signal.aborted && !scanSignal.aborted
    return {
      ...makeResult(url, 0,
        isTimeout ? 'Timeout' : scanSignal.aborted ? 'Cancelled' : 'Network Error',
        isTimeout ? 'timeout' : 'failed',
        responseTime),
      brand: '',
    }
  }
}

// Fallback GET check. brand is pre-fetched by checkUrl so we don't fetch it again.
async function checkUrlGet(url, timeoutMs, scanSignal, brand = '') {
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
    // Cancel the response body immediately — we only need the status code.
    // This prevents downloading full page content (memory/bandwidth) and stops
    // the browser processing Link: rel=preload headers from the response body.
    // DevTools shows the body stream as "cancelled" but the status is correct.
    response.body?.cancel().catch(() => undefined)
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    const group = getStatusGroup(response.status, response.redirected)
    const finalUrl = response.redirected && response.url !== url ? response.url : undefined
    return {
      url,
      statusCode: response.status,
      statusText: response.statusText || defaultStatusText(response.status),
      group,
      responseTime,
      checkedAt: Date.now(),
      finalUrl,
      brand,
    }
  } catch (err) {
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)
    const isTimeout = timeoutController.signal.aborted && !scanSignal.aborted
    if (!isTimeout && !scanSignal.aborted) {
      console.error('[checkUrlGet] GET request failed:', url, err)
    }
    return {
      ...makeResult(url, 0,
        isTimeout ? 'Timeout' : scanSignal.aborted ? 'Cancelled' : 'Network Error',
        isTimeout ? 'timeout' : 'failed',
        responseTime),
      brand,
    }
  }
}

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

function makeResult(url, statusCode, statusText, group, responseTime) {
  return { url, statusCode, statusText, group, responseTime, checkedAt: Date.now() }
}

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

export function exportToCsv(results) {
  const header = ['URL', 'ID', 'Device Type', 'Product Type', 'Brand', 'Status Code', 'Status Text', 'Group', 'Response Time (ms)', 'Final URL', 'Checked At']
  const rows = results.map((r) => [
    r.url,
    r.id ?? '',
    r.deviceType ?? '',
    r.productType ?? '',
    r.brand ?? '',
    String(r.statusCode || ''),
    r.statusText ?? '',
    r.group,
    String(r.responseTime),
    r.finalUrl ?? '',
    new Date(r.checkedAt).toISOString(),
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
