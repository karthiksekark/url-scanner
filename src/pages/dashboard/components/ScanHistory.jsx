import { useState } from 'react'

const GROUP_COLOR = {
  up: 'text-green-600',
  redirected: 'text-amber-600',
  client_error: 'text-orange-600',
  server_error: 'text-red-600',
  failed: 'text-gray-500',
  timeout: 'text-purple-600',
}

function DeltaList({ items, label, colorClass, emptyText }) {
  const [showAll, setShowAll] = useState(false)
  if (items.length === 0) return (
    <div className="text-xs text-gray-400 italic">{emptyText}</div>
  )
  const shown = showAll ? items : items.slice(0, 5)
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-1">{label} ({items.length})</div>
      <ul className="space-y-0.5">
        {shown.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className={`font-mono ${colorClass}`}>{item.statusCode || '—'}</span>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline truncate"
              title={item.url}
            >
              {item.url}
            </a>
            {item.errorReason && (
              <span className="text-gray-400 text-[10px] flex-shrink-0">({item.errorReason})</span>
            )}
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="text-xs text-blue-500 hover:text-blue-700 mt-1"
        >
          {showAll ? 'Show less' : `+${items.length - 5} more`}
        </button>
      )}
    </div>
  )
}

function ScanRecord({ record, isSelected, onSelect }) {
  const date = new Date(record.startedAt)
  const duration = record.completedAt
    ? Math.round((record.completedAt - record.startedAt) / 1000)
    : null

  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-gray-800">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {record.summary.total.toLocaleString()} URLs
            {duration ? ` · ${duration}s` : ''}
            {record.isPartial ? ' · partial' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
          <span className="text-green-600 font-semibold">{record.summary.up} up</span>
          <span className="text-red-500 font-semibold">{(record.summary.failed + record.summary.timeout)} fail</span>
        </div>
      </div>
    </div>
  )
}

export function ScanHistory({ history, onClose }) {
  const [selected, setSelected] = useState(null)

  const selectedRecord = history.find((r) => r.scanId === selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Scan History</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Scan list */}
          <div className="w-56 flex-shrink-0 border-r border-gray-100 p-3 space-y-2 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-1">No scan history yet</p>
            ) : (
              history.map((record) => (
                <ScanRecord
                  key={record.scanId}
                  record={record}
                  isSelected={selected === record.scanId}
                  onSelect={() => setSelected(record.scanId === selected ? null : record.scanId)}
                />
              ))
            )}
          </div>

          {/* Delta detail */}
          <div className="flex-1 p-4 overflow-y-auto">
            {!selectedRecord ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Select a scan to view details
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold text-gray-800 mb-2">Summary</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Total', value: selectedRecord.summary.total, color: 'text-gray-800' },
                      { label: 'Up', value: selectedRecord.summary.up, color: 'text-green-600' },
                      { label: 'Failed', value: selectedRecord.summary.failed + selectedRecord.summary.timeout, color: 'text-red-500' },
                      { label: 'Errors', value: selectedRecord.summary.client_error + selectedRecord.summary.server_error, color: 'text-orange-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-center">
                        <div className={`text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedRecord.delta && (
                  <>
                    <DeltaList
                      items={selectedRecord.delta.newFailures ?? []}
                      label="New failures"
                      colorClass="text-red-500"
                      emptyText="No new failures in this scan"
                    />
                    <DeltaList
                      items={selectedRecord.delta.recovered ?? []}
                      label="Recovered"
                      colorClass="text-green-600"
                      emptyText="No recoveries in this scan"
                    />
                    <DeltaList
                      items={selectedRecord.delta.newUrls ?? []}
                      label="New URLs"
                      colorClass="text-blue-500"
                      emptyText="No new URLs in this scan"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
