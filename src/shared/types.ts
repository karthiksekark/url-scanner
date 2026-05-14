export type StatusGroup = 'up' | 'redirected' | 'client_error' | 'server_error' | 'failed' | 'timeout'

export interface UrlResult {
  url: string
  statusCode: number
  statusText: string
  group: StatusGroup
  responseTime: number
  checkedAt: number
  finalUrl?: string
}

export interface ScanSummary {
  total: number
  up: number
  redirected: number
  client_error: number
  server_error: number
  failed: number
  timeout: number
}

export type ScanStatus = 'idle' | 'fetching_urls' | 'scanning' | 'complete' | 'stopped' | 'error'

export interface ScanState {
  status: ScanStatus
  progress: { total: number; completed: number }
  results: UrlResult[]
  summary: ScanSummary
  error?: string
  lastScannedAt?: number
}

export interface Settings {
  apiEndpoint: string
  urlField: string
  dataPath: string
  pageParam: string
  limitParam: string
  pageSize: number
  concurrency: number
  timeoutMs: number
  customHeaders: { key: string; value: string }[]
}

export const DEFAULT_SETTINGS: Settings = {
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

export const EMPTY_SUMMARY: ScanSummary = {
  total: 0,
  up: 0,
  redirected: 0,
  client_error: 0,
  server_error: 0,
  failed: 0,
  timeout: 0,
}

export function computeSummary(results: UrlResult[]): ScanSummary {
  const summary = { ...EMPTY_SUMMARY, total: results.length }
  for (const r of results) {
    summary[r.group]++
  }
  return summary
}

export function getStatusGroup(statusCode: number, redirected: boolean): StatusGroup {
  if (redirected) return 'redirected'
  if (statusCode >= 200 && statusCode < 300) return 'up'
  if (statusCode >= 300 && statusCode < 400) return 'redirected'
  if (statusCode >= 400 && statusCode < 500) return 'client_error'
  if (statusCode >= 500) return 'server_error'
  return 'failed'
}
