import { useState, useEffect, useMemo } from 'react'
import type { Settings, UrlResult } from '../../shared/types'
import { getSettings, saveSettings } from '../../shared/storage'
import { useScan } from './hooks/useScan'
import { SummaryCards } from './components/SummaryCards'
import { ProgressBar } from './components/ProgressBar'
import { FilterBar } from './components/FilterBar'
import { UrlTable } from './components/UrlTable'
import { SettingsPanel } from './components/SettingsPanel'
import { exportToCsv } from './utils/urlChecker'

type Tab = 'scanner' | 'settings'
type SortField = 'index' | 'url' | 'statusCode' | 'group' | 'responseTime'

const GROUP_ORDER = { server_error: 0, client_error: 1, timeout: 2, failed: 3, redirected: 4, up: 5 }

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('scanner')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('index')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { state, startScan, stopScan, recheckFailed } = useScan()

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      if (!s.apiEndpoint) setActiveTab('settings')
    })
  }, [])

  function handleSaveSettings(s: Settings) {
    setSettings(s)
    saveSettings(s)
  }

  function handleSort(field: string) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field as SortField)
      setSortDir('asc')
    }
  }

  function handleStatusFilter(group: string) {
    setStatusFilter(group)
  }

  const filteredAndSorted = useMemo<UrlResult[]>(() => {
    let results = state.results

    if (statusFilter !== 'all') {
      results = results.filter((r) => r.group === statusFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      results = results.filter((r) => r.url.toLowerCase().includes(q))
    }

    if (sortField !== 'index') {
      results = [...results].sort((a, b) => {
        let cmp = 0
        switch (sortField) {
          case 'url':          cmp = a.url.localeCompare(b.url); break
          case 'statusCode':   cmp = a.statusCode - b.statusCode; break
          case 'group':        cmp = (GROUP_ORDER[a.group] ?? 99) - (GROUP_ORDER[b.group] ?? 99); break
          case 'responseTime': cmp = a.responseTime - b.responseTime; break
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return results
  }, [state.results, statusFilter, search, sortField, sortDir])

  const isScanning = state.status === 'scanning' || state.status === 'fetching_urls'
  const hasResults = state.results.length > 0
  const failedCount = state.summary.failed + state.summary.timeout

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-0 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5 py-4">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-lg">URL Scanner</span>
            </div>

            <nav className="flex gap-1">
              {(['scanner', 'settings'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'px-4 py-5 text-sm font-medium capitalize border-b-2 transition-colors',
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'scanner' && (
            <div className="flex items-center gap-3">
              {hasResults && !isScanning && (
                <>
                  {failedCount > 0 && (
                    <button
                      onClick={() => recheckFailed(settings)}
                      className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                    >
                      Re-check {failedCount.toLocaleString()} failed
                    </button>
                  )}
                  <button
                    onClick={() => exportToCsv(state.results)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                </>
              )}

              {isScanning ? (
                <button
                  onClick={stopScan}
                  className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Stop scan
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!settings.apiEndpoint) {
                      setActiveTab('settings')
                      return
                    }
                    startScan(settings)
                  }}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  {hasResults ? 'Re-scan' : 'Start scan'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        {activeTab === 'scanner' ? (
          <>
            {/* Error banner */}
            {state.status === 'error' && state.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <strong>Scan failed:</strong> {state.error}
              </div>
            )}

            {/* No API configured */}
            {!settings.apiEndpoint && state.status === 'idle' && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-5 py-4 text-sm text-blue-700 flex items-center justify-between">
                <span>No API endpoint configured. Set it up to start scanning.</span>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="ml-4 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                  Go to Settings
                </button>
              </div>
            )}

            {/* Summary cards */}
            {(hasResults || isScanning) && (
              <SummaryCards
                summary={state.summary}
                activeFilter={statusFilter}
                onFilter={handleStatusFilter}
              />
            )}

            {/* Progress */}
            {(isScanning || state.status === 'stopped') && (
              <ProgressBar
                status={state.status}
                completed={state.progress.completed}
                total={state.progress.total}
              />
            )}

            {/* Last scanned */}
            {state.lastScannedAt && !isScanning && (
              <p className="text-xs text-gray-400">
                Last scanned: {new Date(state.lastScannedAt).toLocaleString()}
              </p>
            )}

            {/* Results table */}
            {hasResults && (
              <div className="space-y-3">
                <FilterBar
                  search={search}
                  onSearch={setSearch}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  total={state.results.length}
                  filtered={filteredAndSorted.length}
                />
                <UrlTable results={filteredAndSorted} />
              </div>
            )}
          </>
        ) : (
          <SettingsPanel settings={settings} onSave={handleSaveSettings} />
        )}
      </main>
    </div>
  )
}
