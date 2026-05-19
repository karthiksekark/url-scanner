const CARDS = [
  {
    key: 'all',
    label: 'Total',
    field: 'total',
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
    field: 'up',
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
    field: 'redirected',
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
    field: 'client_error',
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
    field: 'server_error',
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
    field: 'failed',
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
    field: 'timeout',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    activeBg: 'bg-purple-600',
    textColor: 'text-purple-700',
    activeTextColor: 'text-white',
    countColor: 'text-purple-800',
  },
  {
    key: 'postpaidEol',
    label: 'Postpaid EOL',
    field: 'postpaidEol',
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    activeBg: 'bg-slate-600',
    textColor: 'text-slate-600',
    activeTextColor: 'text-white',
    countColor: 'text-slate-800',
    eolFilter: 'postpaid',
  },
  {
    key: 'prepaidEol',
    label: 'Prepaid EOL',
    field: 'prepaidEol',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    activeBg: 'bg-indigo-600',
    textColor: 'text-indigo-600',
    activeTextColor: 'text-white',
    countColor: 'text-indigo-800',
    eolFilter: 'prepaid',
  },
  {
    key: 'accyEol',
    label: 'Accy EOL',
    field: 'accyEol',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    activeBg: 'bg-teal-600',
    textColor: 'text-teal-600',
    activeTextColor: 'text-white',
    countColor: 'text-teal-800',
    eolFilter: 'accy',
  },
]

export function SummaryCards({ summary, activeFilter, onFilter }) {
  return (
    <div className="grid grid-cols-5 gap-2 lg:grid-cols-10">
      {CARDS.map((card) => {
        const isActive = activeFilter === card.key
        const count = summary[card.field] ?? 0
        return (
          <button
            key={card.key}
            onClick={() => onFilter(isActive ? 'all' : card.key)}
            className={[
              'rounded-lg border p-3 text-left transition-all hover:shadow-md cursor-pointer',
              isActive
                ? `${card.activeBg} ${card.activeTextColor} border-transparent shadow-md`
                : `${card.bg} ${card.border} hover:border-gray-300`,
            ].join(' ')}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 leading-tight ${isActive ? card.activeTextColor : card.textColor}`}>
              {card.label}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${isActive ? card.activeTextColor : card.countColor}`}>
              {count.toLocaleString()}
            </div>
            {summary.total > 0 && card.key !== 'all' && (
              <div className={`text-[10px] mt-0.5 ${isActive ? 'text-white/75' : card.textColor}`}>
                {((count / summary.total) * 100).toFixed(1)}%
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
