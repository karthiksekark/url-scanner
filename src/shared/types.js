export const STALENESS_THRESHOLD_MS = 4 * 60 * 60 * 1000

export const DEFAULT_SETTINGS = {
  apiEndpoint: '',
  siteBaseUrl: '',
  method: 'POST',
  payload1: '{}',
  payload2: '{}',
  enableRequest2: true,
  concurrency: 50,
  timeoutMs: 10000,
  customHeaders: [],
  sheetsId: '',
  stalenessHours: 4,
}

export const EMPTY_SUMMARY = {
  total: 0,
  up: 0,
  redirected: 0,
  client_error: 0,
  server_error: 0,
  failed: 0,
  timeout: 0,
  stale: 0,
  new: 0,
  removed: 0,
}

export function computeSummary(results) {
  const summary = { ...EMPTY_SUMMARY, total: results.length }
  for (const r of results) {
    if (r.group && r.group !== 'pending' && summary[r.group] !== undefined) {
      summary[r.group]++
    }
    if (r.urlState === 'stale') summary.stale++
    else if (r.urlState === 'new') summary.new++
    else if (r.urlState === 'removed') summary.removed++
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

// Compute urlState from a result's checkedAt and the staleness threshold.
// 'removed' is preserved — only changed externally via URL list diff.
export function computeUrlState(result, now, thresholdMs) {
  if (result.urlState === 'removed') return 'removed'
  if (!result.checkedAt) return 'new'
  return (now - result.checkedAt) > thresholdMs ? 'stale' : 'fresh'
}
