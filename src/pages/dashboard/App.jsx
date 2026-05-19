import { useState, useEffect, useMemo } from 'react'
import { getSettings, saveSettings } from '../../shared/storage.js'
import { useScan } from './hooks/useScan.js'
import { SummaryCards } from './components/SummaryCards.jsx'
import { ProgressBar } from './components/ProgressBar.jsx'
import { UrlTable } from './components/UrlTable.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { exportToCsv } from './utils/urlChecker.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner')
  const [settings, setSettings] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUrls, setSelectedUrls] = useState(new Set())

  const { state, loadFromStorage, refreshUrlList, startScan, stopScan, recheckFailed, recheckSelected, syncToSheets } = useScan()

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      if (!s.apiEndpoint) {
        setActiveTab('settings')
      } else {
        loadFromStorage(s)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSaveSettings(s) {
    setSettings(s)
    saveSettings(s)
    if (s.apiEndpoint) {
      loadFromStorage(s)
      setActiveTab('scanner')
    }
  }

  // Clear selection whenever results change (new scan, re-check complete)
  useEffect(() => {
    if (state.status === 'complete') setSelectedUrls(new Set())
  }, [state.status])

  const preFiltered = useMemo(() => {
    if (statusFilter === 'all') return state.results
    return state.results.filter((r) => r.group === statusFilter)
  }, [state.results, statusFilter])

  const isScanning = state.status === 'scanning' || state.status === 'fetching_urls' || state.status === 'refreshing_urls' || state.status === 'loading'
  const hasResults = state.results.length > 0
  const failedCount = state.summary.failed + state.summary.timeout
  const hasPreFiltered = preFiltered.length > 0
  const selectedCount = selectedUrls.size

  const staleCount = state.summary.stale
  const newCount = state.summary.new
  const removedCount = state.summary.removed
  const hasStateInfo = staleCount > 0 || newCount > 0 || removedCount > 0

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
              {['scanner', 'settings'].map((tab) => (
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
              {/* Sheets sync indicator */}
              {state.sheetsSyncing && (
                <span className="flex items-center gap-1.5 text-xs text-blue-500">
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  Syncing…
                </span>
              )}
              {!state.sheetsSyncing && state.sheetsLastSyncAt && (
                <span className="text-xs text-gray-400" title={`Last synced: ${new Date(state.sheetsLastSyncAt).toLocaleString()}`}>
                  Sheets ✓
                </span>
              )}

              {hasResults && !isScanning && (
                <>
                  {/* Re-check selected */}
                  {selectedCount > 0 && (
                    <button
                      onClick={() => recheckSelected(selectedUrls, settings)}
                      className="px-4 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      Re-check {selectedCount.toLocaleString()} selected
                    </button>
                  )}

                  {/* Re-check failed */}
                  {failedCount > 0 && selectedCount === 0 && (
                    <button
                      onClick={() => recheckFailed(settings)}
                      className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                    >
                      Re-check {failedCount.toLocaleString()} failed
                    </button>
                  )}

                  {/* Sync to Sheets */}
                  {settings.sheetsId && (
                    <button
                      onClick={() => syncToSheets(settings)}
                      disabled={state.sheetsSyncing}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Sync Sheets
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
                  Stop
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {settings.apiEndpoint && (
                    <button
                      onClick={() => refreshUrlList(settings)}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Refresh list
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!settings.apiEndpoint) { setActiveTab('settings'); return }
                      startScan(settings)
                    }}
                    className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    {hasResults ? 'Full scan' : 'Start scan'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        {activeTab === 'scanner' ? (
          <>
            {state.status === 'error' && state.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <strong>Error:</strong> {state.error}
              </div>
            )}

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

            {(hasResults || isScanning) && (
              <SummaryCards
                summary={state.summary}
                activeFilter={statusFilter}
                onFilter={setStatusFilter}
              />
            )}

            {/* URL state info bar */}
            {hasResults && !isScanning && hasStateInfo && (
              <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
                {staleCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                    {staleCount.toLocaleString()} stale
                  </span>
                )}
                {newCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                    {newCount.toLocaleString()} new
                  </span>
                )}
                {removedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                    {removedCount.toLocaleString()} removed
                  </span>
                )}
                {state.urlListFetchedAt && (
                  <span className="ml-auto text-gray-400">
                    URL list: {new Date(state.urlListFetchedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {(isScanning || state.status === 'stopped') && (
              <ProgressBar
                status={state.status}
                completed={state.progress.completed}
                total={state.progress.total}
              />
            )}

            {state.lastScannedAt && !isScanning && (
              <p className="text-xs text-gray-400">
                Last scanned: {new Date(state.lastScannedAt).toLocaleString()}
              </p>
            )}

            {hasPreFiltered && (
              <UrlTable
                results={preFiltered}
                selectedUrls={selectedUrls}
                onSelectionChange={setSelectedUrls}
              />
            )}
          </>
        ) : (
          <SettingsPanel settings={settings} onSave={handleSaveSettings} />
        )}
      </main>
    </div>
  )
}
