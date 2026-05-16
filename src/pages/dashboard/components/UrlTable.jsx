import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const GROUP_BADGE = {
  up:           { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Up' },
  redirected:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Redirected' },
  client_error: { bg: 'bg-orange-100', text: 'text-orange-700', label: '4xx Error' },
  server_error: { bg: 'bg-red-100',    text: 'text-red-700',    label: '5xx Error' },
  failed:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Failed' },
  timeout:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Timeout' },
}

const STATUS_DOT = {
  up:           'bg-green-500',
  redirected:   'bg-amber-400',
  client_error: 'bg-orange-500',
  server_error: 'bg-red-500',
  failed:       'bg-gray-400',
  timeout:      'bg-purple-500',
}

const ROW_HEIGHT = 44

// '3rem 1fr 7rem 8rem 6rem 8rem 7rem 5rem'
// # | URL | Device Type | Product Type | Status | Group | Response | Redirect
const COLS = '3rem 1fr 7rem 8rem 6rem 8rem 7rem 5rem'

function pageName(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? ''
    return last.replace(/-/g, ' ') || url
  } catch {
    return url
  }
}

export function UrlTable({ results }) {
  const parentRef = useRef(null)

  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
        No results to display
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Fixed header */}
      <div
        className="grid bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500"
        style={{ gridTemplateColumns: COLS }}
      >
        <div className="px-3 py-3 text-right">#</div>
        <div className="px-3 py-3">URL</div>
        <div className="px-3 py-3">Device Type</div>
        <div className="px-3 py-3">Product Type</div>
        <div className="px-3 py-3 text-right">Status</div>
        <div className="px-3 py-3">Group</div>
        <div className="px-3 py-3 text-right">Response</div>
        <div className="px-3 py-3">Redirect</div>
      </div>

      {/* Virtual rows */}
      <div
        ref={parentRef}
        className="scrollbar-thin overflow-auto"
        style={{ height: 'min(600px, calc(100vh - 420px))' }}
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const result = results[virtualRow.index]
            const badge = GROUP_BADGE[result.group]
            const name = pageName(result.url)
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={[
                  'absolute top-0 left-0 w-full grid border-b border-gray-100 hover:bg-blue-50 transition-colors',
                  virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                ].join(' ')}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: ROW_HEIGHT,
                  gridTemplateColumns: COLS,
                }}
              >
                {/* # */}
                <div className="px-3 flex items-center justify-end text-xs text-gray-400 tabular-nums">
                  {virtualRow.index + 1}
                </div>

                {/* URL — shows page name, opens full URL */}
                <div className="px-3 flex items-center min-w-0">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={result.url}
                    className="text-sm text-blue-700 truncate hover:underline capitalize"
                  >
                    {name}
                  </a>
                </div>

                {/* Device Type */}
                <div className="px-3 flex items-center">
                  <span className="text-xs text-gray-600 truncate">{result.deviceType ?? ''}</span>
                </div>

                {/* Product Type */}
                <div className="px-3 flex items-center">
                  <span className="text-xs text-gray-600 truncate">{result.productType ?? ''}</span>
                </div>

                {/* Status code */}
                <div className="px-3 flex items-center justify-end gap-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[result.group]}`} />
                  <span className="text-sm font-mono tabular-nums font-medium text-gray-800">
                    {result.statusCode || '—'}
                  </span>
                </div>

                {/* Group badge */}
                <div className="px-3 flex items-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Response time */}
                <div className="px-3 flex items-center justify-end">
                  <span className="text-xs tabular-nums text-gray-500">
                    {result.responseTime > 0 ? `${result.responseTime.toLocaleString()} ms` : '—'}
                  </span>
                </div>

                {/* Redirect arrow */}
                <div className="px-3 flex items-center">
                  {result.finalUrl && (
                    <a
                      href={result.finalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={result.finalUrl}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      ↪
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
