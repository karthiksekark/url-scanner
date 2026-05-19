import { useMemo, useState } from 'react'

const SECTIONS = [
  { key: 'deviceType', label: 'Device Type', field: 'deviceType' },
  { key: 'productType', label: 'Product Type', field: 'productType' },
  { key: 'brand', label: 'Brand', field: 'brand' },
]

function ChevronIcon({ open }) {
  return (
    <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function SidebarSection({ label, field, results, selected, onToggle }) {
  const [open, setOpen] = useState(true)

  const options = useMemo(() => {
    const counts = new Map()
    for (const r of results) {
      const v = r[field] || '(none)'
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
  }, [results, field])

  if (options.length === 0) return null

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {label}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {options.map(([value, count]) => {
            const isChecked = selected.has(value === '(none)' ? '' : value)
            return (
              <label
                key={value}
                className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-blue-50 group"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(field, value === '(none)' ? '' : value)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                />
                <span className={`text-xs flex-1 truncate ${isChecked ? 'text-blue-700 font-medium' : 'text-gray-600 group-hover:text-gray-800'}`}>
                  {value}
                </span>
                <span className={`text-[10px] tabular-nums flex-shrink-0 ${isChecked ? 'text-blue-500' : 'text-gray-400'}`}>
                  {count.toLocaleString()}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ results, filters, onFiltersChange, collapsed, onToggle }) {
  const activeCount = Object.values(filters).reduce((sum, set) => sum + set.size, 0)

  function toggleValue(field, value) {
    const current = filters[field] ?? new Set()
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onFiltersChange({ ...filters, [field]: next })
  }

  function clearAll() {
    onFiltersChange({ deviceType: new Set(), productType: new Set(), brand: new Set() })
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 border-r border-gray-200 bg-white pt-2 flex-shrink-0">
        <button
          onClick={onToggle}
          title="Open filters"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors relative"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-xs font-semibold text-gray-700">Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
            >
              Clear
            </button>
          )}
          <button
            onClick={onToggle}
            title="Collapse filters"
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-3 py-4">Run a scan to see filters</p>
        ) : (
          SECTIONS.map((s) => (
            <SidebarSection
              key={s.key}
              label={s.label}
              field={s.field}
              results={results}
              selected={filters[s.key] ?? new Set()}
              onToggle={toggleValue}
            />
          ))
        )}
      </div>
    </div>
  )
}
