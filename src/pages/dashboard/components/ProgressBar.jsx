const STATUS_LABEL = {
  idle: '',
  fetching_urls: 'Fetching URLs from API…',
  scanning: 'Scanning URLs…',
  complete: 'Scan complete',
  stopped: 'Scan stopped',
  error: 'Scan failed',
}

export function ProgressBar({ status, completed, total }) {
  if (status === 'idle') return null

  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0
  const isActive = status === 'fetching_urls' || status === 'scanning'
  const isError = status === 'error'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${isError ? 'text-red-600' : 'text-gray-700'}`}>
          {STATUS_LABEL[status]}
        </span>
        {total > 0 && (
          <span className="text-gray-500 tabular-nums">
            {completed.toLocaleString()} / {total.toLocaleString()}
            {isActive && ` · ${pct.toFixed(1)}%`}
          </span>
        )}
      </div>

      <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
        {status === 'fetching_urls' ? (
          <div className="h-full w-1/3 rounded-full bg-blue-400 animate-[slide_1.2s_ease-in-out_infinite]" />
        ) : (
          <div
            className={[
              'h-full rounded-full transition-all duration-300',
              isError        ? 'bg-red-500'    :
              status === 'stopped'  ? 'bg-yellow-400' :
              status === 'complete' ? 'bg-green-500'  :
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
