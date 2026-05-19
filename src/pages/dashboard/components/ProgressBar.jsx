const STATUS_LABEL = {
  idle: '',
  fetching_urls: 'Fetching URL list…',
  fetching_brands: 'Fetching brand data…',
  scanning: 'Scanning URLs…',
  complete: 'Scan complete',
  stopped: 'Scan stopped',
  error: 'Scan failed',
}

export function ProgressBar({ status, completed, total, brandsFetched, brandsTotal }) {
  if (status === 'idle') return null

  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0
  const brandPct = brandsTotal > 0 ? Math.min(100, (brandsFetched / brandsTotal) * 100) : 0
  const isActive = status === 'fetching_urls' || status === 'fetching_brands' || status === 'scanning'
  const isError = status === 'error'
  const isIndeterminate = status === 'fetching_urls' || status === 'fetching_brands'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${isError ? 'text-red-600' : 'text-gray-700'}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
        <span className="text-gray-500 tabular-nums">
          {status === 'fetching_brands' && brandsTotal > 0
            ? `${brandsFetched.toLocaleString()} / ${brandsTotal.toLocaleString()} brands`
            : total > 0
              ? `${completed.toLocaleString()} / ${total.toLocaleString()}${isActive ? ` · ${pct.toFixed(1)}%` : ''}`
              : ''
          }
        </span>
      </div>

      <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
        {isIndeterminate ? (
          <div className="h-full w-1/3 rounded-full bg-blue-400 animate-[slide_1.2s_ease-in-out_infinite]" />
        ) : (
          <div
            className={[
              'h-full rounded-full transition-all duration-300',
              isError                ? 'bg-red-500'    :
              status === 'stopped'   ? 'bg-yellow-400' :
              status === 'complete'  ? 'bg-green-500'  :
              'bg-blue-500',
            ].join(' ')}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  )
}
