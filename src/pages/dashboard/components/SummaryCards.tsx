import type { ScanSummary } from '../../../shared/types'

interface Props {
  summary: ScanSummary
  activeFilter: string
  onFilter: (group: string) => void
}

const CARDS = [
  {
    key: 'all',
    label: 'Total',
    field: 'total' as keyof ScanSummary,
    bg: 'bg-white',
    border: 'border-gray-200',
    activeBg: 'bg-gray-800',
    textColor: 'text-gray-800',
    activeTextColor: 'text-white',
    countColor: 'text-gray-900',
  },
  {
    key: 'up',
    label: 'Up',
    field: 'up' as keyof ScanSummary,
    bg: 'bg-green-50',
    border: 'border-green-200',
    activeBg: 'bg-green-600',
    textColor: 'text-green-700',
    activeTextColor: 'text-white',
    countColor: 'text-green-800',
  },
  {
    key: 'redirected',
    label: 'Redirected',
    field: 'redirected' as keyof ScanSummary,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    activeBg: 'bg-amber-500',
    textColor: 'text-amber-700',
    activeTextColor: 'text-white',
    countColor: 'text-amber-800',
  },
  {
    key: 'client_error',
    label: '4xx Errors',
    field: 'client_error' as keyof ScanSummary,
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    activeBg: 'bg-orange-500',
    textColor: 'text-orange-700',
    activeTextColor: 'text-white',
    countColor: 'text-orange-800',
  },
  {
    key: 'server_error',
    label: '5xx Errors',
    field: 'server_error' as keyof ScanSummary,
    bg: 'bg-red-50',
    border: 'border-red-200',
    activeBg: 'bg-red-600',
    textColor: 'text-red-700',
    activeTextColor: 'text-white',
    countColor: 'text-red-800',
  },
  {
    key: 'failed',
    label: 'Failed',
    field: 'failed' as keyof ScanSummary,
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    activeBg: 'bg-gray-600',
    textColor: 'text-gray-600',
    activeTextColor: 'text-white',
    countColor: 'text-gray-700',
  },
  {
    key: 'timeout',
    label: 'Timeout',
    field: 'timeout' as keyof ScanSummary,
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    activeBg: 'bg-purple-600',
    textColor: 'text-purple-700',
    activeTextColor: 'text-white',
    countColor: 'text-purple-800',
  },
] as const

export function SummaryCards({ summary, activeFilter, onFilter }: Props) {
  return (
    <div className="grid grid-cols-7 gap-3">
      {CARDS.map((card) => {
        const isActive = activeFilter === card.key
        const count = card.key === 'all' ? summary.total : summary[card.field]
        return (
          <button
            key={card.key}
            onClick={() => onFilter(isActive ? 'all' : card.key)}
            className={[
              'rounded-lg border p-4 text-left transition-all hover:shadow-md cursor-pointer',
              isActive
                ? `${card.activeBg} ${card.activeTextColor} border-transparent shadow-md`
                : `${card.bg} ${card.border} hover:border-gray-300`,
            ].join(' ')}
          >
            <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${isActive ? card.activeTextColor : card.textColor}`}>
              {card.label}
            </div>
            <div className={`text-3xl font-bold tabular-nums ${isActive ? card.activeTextColor : card.countColor}`}>
              {count.toLocaleString()}
            </div>
            {summary.total > 0 && card.key !== 'all' && (
              <div className={`text-xs mt-1 ${isActive ? 'text-white/75' : card.textColor}`}>
                {((count / summary.total) * 100).toFixed(1)}%
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
