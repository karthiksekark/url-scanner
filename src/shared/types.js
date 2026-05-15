export const DEFAULT_SETTINGS = {
  apiEndpoint: '',
  urlField: 'url',
  dataPath: '',
  pageParam: 'page',
  limitParam: 'limit',
  pageSize: 100,
  concurrency: 50,
  timeoutMs: 10000,
  customHeaders: [],
}

export const EMPTY_SUMMARY = {
  total: 0,
  up: 0,
  redirected: 0,
  client_error: 0,
  server_error: 0,
  failed: 0,
  timeout: 0,
}

export function computeSummary(results) {
  const summary = { ...EMPTY_SUMMARY, total: results.length }
  for (const r of results) {
    summary[r.group]++
  }
  return summary
}

export function getStatusGroup(statusCode, redirected) {
  if (redirected) return 'redirected'
  if (statusCode >= 200 && statusCode < 300) return 'up'
  if (statusCode >= 300 && statusCode < 400) return 'redirected'
  if (statusCode >= 400 && statusCode < 500) return 'client_error'
  if (statusCode >= 500) return 'server_error'
  return 'failed'
}
