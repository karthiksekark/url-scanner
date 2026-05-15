import { getStatusGroup } from '../../../shared/types.js'

function resolvePath(obj, path) {
  if (!path) return obj
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return acc[key]
    return undefined
  }, obj)
}

function extractItems(data, dataPath) {
  const resolved = resolvePath(data, dataPath)
  if (Array.isArray(resolved)) return resolved

  if (resolved && typeof resolved === 'object') {
    for (const key of ['data', 'results', 'items', 'urls', 'records', 'list']) {
      if (Array.isArray(resolved[key])) return resolved[key]
    }
  }

  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['data', 'results', 'items', 'urls', 'records', 'list']) {
      if (Array.isArray(data[key])) return data[key]
    }
  }

  throw new Error('Could not locate URL array in API response. Check your "Data path" setting.')
}

export async function fetchAllUrls(settings, signal, onPageFetched) {
  const allUrls = []
  let page = 1

  const headers = { 'Content-Type': 'application/json' }
  for (const { key, value } of settings.customHeaders) {
    if (key.trim()) headers[key.trim()] = value
  }

  while (!signal.aborted) {
    const endpoint = new URL(settings.apiEndpoint)
    endpoint.searchParams.set(settings.pageParam, String(page))
    endpoint.searchParams.set(settings.limitParam, String(settings.pageSize))

    const response = await fetch(endpoint.toString(), {
      signal,
      credentials: 'include',
      headers,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status} ${response.statusText} on page ${page}`)
    }

    const data = await response.json()
    const items = extractItems(data, settings.dataPath)

    const urls = items
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const val = item[settings.urlField]
          return typeof val === 'string' ? val : null
        }
        return null
      })
      .filter(Boolean)

    allUrls.push(...urls)
    onPageFetched?.(allUrls.length)

    if (items.length < settings.pageSize) break
    page++
  }

  return allUrls
}

export async function checkUrl(url, timeoutMs, scanSignal) {
  if (scanSignal.aborted) {
    return makeResult(url, 0, 'Cancelled', 'failed', 0)
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onScanAbort = () => timeoutController.abort()
  scanSignal.addEventListener('abort', onScanAbort, { once: true })

  const startTime = performance.now()

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: timeoutController.signal,
      redirect: 'follow',
    })
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    if (response.status === 405) {
      return await checkUrlGet(url, timeoutMs, scanSignal)
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
    }
  } catch {
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)

    const isTimeout = timeoutController.signal.aborted && !scanSignal.aborted
    return makeResult(
      url, 0,
      isTimeout ? 'Timeout' : scanSignal.aborted ? 'Cancelled' : 'Network Error',
      isTimeout ? 'timeout' : 'failed',
      responseTime
    )
  }
}

async function checkUrlGet(url, timeoutMs, scanSignal) {
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
    })
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
    }
  } catch {
    const responseTime = Math.round(performance.now() - startTime)
    clearTimeout(timeoutId)
    scanSignal.removeEventListener('abort', onScanAbort)
    const isTimeout = timeoutController.signal.aborted && !scanSignal.aborted
    return makeResult(url, 0, isTimeout ? 'Timeout' : 'Network Error', isTimeout ? 'timeout' : 'failed', responseTime)
  }
}

export async function runConcurrent(items, concurrency, fn, onResult, signal) {
  let idx = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length && !signal.aborted) {
        const i = idx++
        const result = await fn(items[i])
        onResult(result)
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
  const header = ['URL', 'Status Code', 'Status Text', 'Group', 'Response Time (ms)', 'Final URL', 'Checked At']
  const rows = results.map((r) => [
    r.url,
    String(r.statusCode || ''),
    r.statusText,
    r.group,
    String(r.responseTime),
    r.finalUrl ?? '',
    new Date(r.checkedAt).toISOString(),
  ])

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `url-scan-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
