import { useState, useEffect, useMemo, useCallback } from 'react'
import { getSettings, saveSettings } from '../../shared/storage.js'
import { useScan } from './hooks/useScan.js'
import { SummaryCards } from './components/SummaryCards.jsx'
import { ProgressBar } from './components/ProgressBar.jsx'
import { UrlTable } from './components/UrlTable.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { PasteUrlsBar } from './components/PasteUrlsBar.jsx'
import { ScanHistory } from './components/ScanHistory.jsx'
import { exportToCsv } from './utils/urlChecker.js'

const EMPTY_SIDEBAR_FILTERS = { deviceType: new Set(), productType: new Set(), brand: new Set() }

function DeltaBanner({ delta, onDismiss }) {
  if (!delta) return null
  const { newFailures, recovered, newUrls } = delta
  const total = newFailures.length + recovered.length + newUrls.length
  if (total === 0) return null

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 text-sm flex-wrap">
        {newFailures.length > 0 && (
          <span className="flex items-center gap-1.5 text-red-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {newFailures.length} new failure{newFailures.length !== 1 ? 's' : ''}
          </span>
        )}
        {recovered.length > 0 && (
          <span className="flex items-center gap-1.5 text-green-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {recovered.length} recovered
          </span>
        )}
        {newUrls.length > 0 && (
          <span className="flex items-center gap-1.5 text-blue-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {newUrls.length} new URL{newUrls.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function PartialBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 flex items-center gap-2">
      <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      Scan stopped early — results are incomplete.
    </div>
  )
}

function ConfirmDialog({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Start full scan?</h3>
        <p className="text-sm text-gray-500 mb-5">
          This will replace all existing results with fresh data.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Start scan
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner')
  const [settings, setSettings] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sidebarFilters, setSidebarFilters] = useState(EMPTY_SIDEBAR_FILTERS)
  const [selectedUrls, setSelectedUrls] = useState(new Set())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => { try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false } }
  )
  const [showHistory, setShowHistory] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    state, loadFromStorage, refreshUrlList, startScan, stopScan,
    recheckFailed, recheckSelected, recheckPasted, syncToSheets, dismissDelta,
  } = useScan()

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      if (!s.apiEndpoint) setActiveTab('settings')
      else loadFromStorage(s)
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

  useEffect(() => {
    if (state.status === 'complete') setSelectedUrls(new Set())
  }, [state.status])

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  // Apply status tile filter + EOL filter + sidebar facet filters (AND across categories)
  const preFiltered = useMemo(() => {
    let results = state.results

    if (statusFilter === 'postpaidEol') {
      results = results.filter((r) => r.eolType === 'postpaid')
    } else if (statusFilter === 'prepaidEol') {
      results = results.filter((r) => r.eolType === 'prepaid')
    } else if (statusFilter === 'accyEol') {
      results = results.filter((r) => r.eolType === 'accy')
    } else if (statusFilter !== 'all') {
      results = results.filter((r) => r.group === statusFilter)
    }

    if (sidebarFilters.deviceType.size > 0) {
      results = results.filter((r) => sidebarFilters.deviceType.has(r.deviceType ?? ''))
    }
    if (sidebarFilters.productType.size > 0) {
      results = results.filter((r) => sidebarFilters.productType.has(r.productType ?? ''))
    }
    if (sidebarFilters.brand.size > 0) {
      results = results.filter((r) => sidebarFilters.brand.has(r.brand ?? ''))
    }

    return results
  }, [state.results, statusFilter, sidebarFilters])

  const isScanning = ['scanning', 'fetching_urls', 'fetching_brands', 'refreshing_urls', 'loading'].includes(state.status)
  const hasResults = state.results.length > 0
  const failedCount = state.summary.failed + state.summary.timeout
  const selectedCount = selectedUrls.size

  const staleCount = state.summary.stale
  const newCount = state.summary.new
  const removedCount = state.summary.removed
  const hasStateInfo = staleCount > 0 || newCount > 0 || removedCount > 0

  const hasSidebarFilters = Object.values(sidebarFilters).some((s) => s.size > 0)

  function handleStartScan() {
    if (!settings.apiEndpoint) { setActiveTab('settings'); return }
    if (hasResults) { setShowConfirm(true); return }
    startScan(settings)
  }

  function handleConfirmScan() {
    setShowConfirm(false)
    startScan(settings)
  }

  const handleRecheckPasted = useCallback((urls) => {
    recheckPasted(urls, settings)
  }, [recheckPasted, settings])

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dialogs */}
      {showConfirm && (
        <ConfirmDialog onConfirm={handleConfirmScan} onCancel={() => setShowConfirm(false)} />
      )}
      {showHistory && (
        <ScanHistory history={state.scanHistory} onClose={() => setShowHistory(false)} />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-0 flex items-center justify-between">
          <div className="flex items-center gap-6">
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
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-5 text-sm font-medium capitalize border-b-2 transition-colors ${
                    activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'scanner' && (
            <div className="flex items-center gap-2">
              {/* Sheets auth expired warning */}
              {state.sheetsAuthExpired && (
                <span className="text-xs text-amber-600 font-medium">Sheets disconnected</span>
              )}

              {/* Sheets sync indicator */}
              {state.sheetsSyncing && (
                <span className="flex items-center gap-1.5 text-xs text-blue-500">
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  Syncing…
                </span>
              )}
              {!state.sheetsSyncing && state.sheetsLastSyncAt && !state.sheetsAuthExpired && (
                <span className="text-xs text-gray-400" title={`Last synced: ${new Date(state.sheetsLastSyncAt).toLocaleString()}`}>
                  Sheets ✓
                </span>
              )}

              {hasResults && !isScanning && (
                <>
                  {selectedCount > 0 && (
                    <button
                      onClick={() => recheckSelected(selectedUrls, settings)}
                      className="px-3 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      Re-check {selectedCount.toLocaleString()} selected
                    </button>
                  )}

                  {failedCount > 0 && selectedCount === 0 && (
                    <button
                      onClick={() => recheckFailed(settings)}
                      className="px-3 py-2 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                    >
                      Re-check {failedCount.toLocaleString()} failed
                    </button>
                  )}

                  {state.scanHistory.length > 0 && (
                    <button
                      onClick={() => setShowHistory(true)}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                      title="View scan history"
                    >
                      History
                    </button>
                  )}

                  {settings.sheetsId && (
                    <button onClick={() => syncToSheets(settings)} disabled={state.sheetsSyncing}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Sync Sheets
                    </button>
                  )}

                  <button onClick={() => exportToCsv(state.results)}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                </>
              )}

              {isScanning ? (
                <button onClick={stopScan}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Stop
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {settings.apiEndpoint && (
                    <button onClick={() => refreshUrlList(settings)}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                      Update List
                    </button>
                  )}
                  <button onClick={handleStartScan}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                    Full Scan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {activeTab === 'scanner' ? (
          <div className="space-y-4">
            {state.status === 'error' && state.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <strong>Error:</strong> {state.error}
              </div>
            )}

            {!settings.apiEndpoint && state.status === 'idle' && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-5 py-4 text-sm text-blue-700 flex items-center justify-between">
                <span>No API endpoint configured. Set it up to start scanning.</span>
                <button onClick={() => setActiveTab('settings')}
                  className="ml-4 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                  Go to Settings
                </button>
              </div>
            )}

            {(hasResults || isScanning) && (
              <SummaryCards
                summary={state.summary}
                activeFilter={statusFilter}
                onFilter={(f) => { setStatusFilter(f); setSidebarFilters(EMPTY_SIDEBAR_FILTERS) }}
              />
            )}

            {/* URL state info bar */}
            {hasResults && !isScanning && hasStateInfo && (
              <div className="flex items-center gap-4 text-xs text-gray-500 px-1 flex-wrap">
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
                    List: {new Date(state.urlListFetchedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {(isScanning || state.status === 'stopped') && (
              <ProgressBar
                status={state.status}
                completed={state.progress.completed}
                total={state.progress.total}
                brandsFetched={state.progress.brandsFetched}
                brandsTotal={state.progress.brandsTotal}
              />
            )}

            {state.lastScannedAt && !isScanning && (
              <p className="text-xs text-gray-400">
                Last scanned: {new Date(state.lastScannedAt).toLocaleString()}
              </p>
            )}

            {/* Delta banner */}
            <DeltaBanner delta={state.delta} onDismiss={dismissDelta} />

            {/* Partial scan banner */}
            {state.isPartial && state.status === 'stopped' && <PartialBanner />}

            {/* Sidebar + table */}
            {(hasResults || isScanning) && (
              <div className="flex gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white min-h-[400px]">
                <Sidebar
                  results={state.results}
                  filters={sidebarFilters}
                  onFiltersChange={setSidebarFilters}
                  collapsed={sidebarCollapsed}
                  onToggle={toggleSidebar}
                />

                <div className="flex-1 min-w-0 p-4 space-y-3">
                  <PasteUrlsBar onScan={handleRecheckPasted} isScanning={isScanning} />
                  <UrlTable
                    results={preFiltered}
                    selectedUrls={selectedUrls}
                    onSelectionChange={setSelectedUrls}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <SettingsPanel settings={settings} onSave={handleSaveSettings} />
        )}
      </main>
    </div>
  )
}
