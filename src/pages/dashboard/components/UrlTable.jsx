import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { ALL_COLUMNS, GROUP_BADGE, pageName } from '../utils/columns.js'

const STATUS_DOT = {
  up: 'bg-green-500', redirected: 'bg-amber-400',
  client_error: 'bg-orange-500', server_error: 'bg-red-500',
  failed: 'bg-gray-400', timeout: 'bg-purple-500', pending: 'bg-blue-300',
}

const URL_STATE_BADGE = {
  new:     { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'New' },
  stale:   { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Stale' },
  removed: { bg: 'bg-gray-100',  text: 'text-gray-500',  label: 'Removed' },
}

const PAGE_SIZE_OPTIONS = [50, 100, 250, 'All']
const DEFAULT_PAGE_SIZE = 100
const ROW_HEIGHT = 44

function responseTimeColor(ms) {
  if (!ms || ms <= 0) return 'text-gray-400'
  if (ms < 500) return 'text-green-600'
  if (ms < 2000) return 'text-amber-600'
  return 'text-red-600'
}

function SortIcon({ active, dir }) {
  return (
    <svg className={`h-3 w-3 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-300'}`}
      viewBox="0 0 10 14" fill="currentColor">
      <path d="M5 0L9 5H1L5 0Z" className={active && dir === 'asc' ? 'text-blue-600' : 'text-gray-300'} />
      <path d="M5 14L1 9H9L5 14Z" className={active && dir === 'desc' ? 'text-blue-600' : 'text-gray-300'} />
    </svg>
  )
}

function FilterIcon({ active }) {
  return (
    <svg className={`h-3.5 w-3.5 ${active ? 'text-blue-600' : 'text-gray-400'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
    </svg>
  )
}

function HeaderCell({ col, sortField, sortDir, onSort, isFilterOpen, onToggleFilter,
  filterValue, onFilterChange, onFilterClear, suggestions, onSuggestionSelect, popoverRef }) {

  const isActiveSort = sortField === col.id
  const hasFilter = filterValue.length > 0

  function handleKeyDown(e) {
    if (e.key === 'Escape') onToggleFilter()
    if (e.key === 'Enter' && suggestions.length > 0) onSuggestionSelect(suggestions[0])
  }

  return (
    <div className="relative px-3 py-2.5">
      <div className="flex items-center gap-1">
        {col.sortable ? (
          <button
            onClick={() => onSort(col.id)}
            className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${isActiveSort ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {col.label}
            <SortIcon active={isActiveSort} dir={sortDir} />
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{col.label}</span>
        )}

        {col.filterable && (
          <button
            onClick={() => onToggleFilter(col.id)}
            title={hasFilter ? `Filtering: "${filterValue}"` : `Filter by ${col.label}`}
            className={`ml-0.5 p-0.5 rounded transition-colors ${isFilterOpen || hasFilter ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <FilterIcon active={isFilterOpen || hasFilter} />
          </button>
        )}
      </div>

      {isFilterOpen && (
        <div ref={popoverRef}
          className="absolute top-full left-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl"
          style={{ minWidth: 190 }}>
          <div className="flex items-center gap-1 p-2">
            <input
              autoFocus
              type="text"
              value={filterValue}
              onChange={(e) => onFilterChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Filter ${col.label}…`}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {filterValue && (
              <button onClick={onFilterClear} className="text-gray-400 hover:text-red-500 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {suggestions.length > 0 && (
            <ul className="border-t border-gray-100 max-h-52 overflow-y-auto py-1">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); onSuggestionSelect(s) }}
                    className={`w-full text-left text-sm px-3 py-1.5 hover:bg-blue-50 transition-colors
                      ${s === filterValue ? 'text-blue-700 font-medium bg-blue-50' : 'text-gray-700'}`}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function PaginationBar({ page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const start = pageSize === 'All' ? 1 : (page - 1) * pageSize + 1
  const end = pageSize === 'All' ? total : Math.min(page * pageSize, total)

  function pageNumbers() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set([1, totalPages, page, Math.max(1, page - 1), Math.min(totalPages, page + 1)])
    return [...set].sort((a, b) => a - b).reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
      acc.push(p)
      return acc
    }, [])
  }

  const btnBase = 'px-2.5 py-1 text-sm rounded border transition-colors'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 whitespace-nowrap">Rows</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(e.target.value === 'All' ? 'All' : Number(e.target.value))}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <span className="text-sm text-gray-500 whitespace-nowrap order-last sm:order-none">
        {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}
            className={`${btnBase} border-gray-300 disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed`}>‹</button>
          {pageNumbers().map((p, i) =>
            typeof p === 'string' ? (
              <span key={`e${i}`} className="px-1 text-sm text-gray-400">{p}</span>
            ) : (
              <button key={p} onClick={() => onPageChange(p)}
                className={`${btnBase} ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}>
                {p}
              </button>
            )
          )}
          <button disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className={`${btnBase} border-gray-300 disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed`}>›</button>
        </div>
      )}
    </div>
  )
}

function ColumnToggleMenu({ columns, visibleIds, onToggle, onClose }) {
  return (
    <div className="absolute top-full right-0 z-40 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 min-w-44">
      {columns.map((col) => (
        <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            checked={visibleIds.has(col.id)}
            onChange={() => onToggle(col.id)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs text-gray-700">{col.label}</span>
        </label>
      ))}
    </div>
  )
}

function buildGridCols(visibleCols) {
  const widths = {
    url: '1fr', deviceType: '7rem', productType: '8rem', brand: '7rem',
    deviceId: '8rem', eolType: '5rem', statusCode: '6rem', group: '8rem', responseTime: '7rem',
  }
  return ['2rem', '3rem', ...visibleCols.map((c) => widths[c.id] ?? '8rem'), '5rem'].join(' ')
}

export function UrlTable({ results, selectedUrls, onSelectionChange, columnFilters, onColumnFiltersChange }) {
  const [sortField, setSortField] = useState('index')
  const [sortDir, setSortDir] = useState('asc')
  const [activeFilterCol, setActiveFilterCol] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [showColumnToggle, setShowColumnToggle] = useState(false)
  const [visibleColIds, setVisibleColIds] = useState(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
  )
  const popoverRef = useRef(null)
  const colMenuRef = useRef(null)

  const COLUMN_DEFS = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleColIds.has(c.id)),
    [visibleColIds]
  )
  const GRID_COLS = useMemo(() => buildGridCols(COLUMN_DEFS), [COLUMN_DEFS])

  useEffect(() => {
    if (!activeFilterCol) return
    function onMouseDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setActiveFilterCol(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [activeFilterCol])

  useEffect(() => {
    if (!showColumnToggle) return
    function onMouseDown(e) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColumnToggle(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showColumnToggle])

  // Reset to page 1 when filters or sort change, but preserve page when only results refresh
  useEffect(() => { setPage(1) }, [columnFilters, sortField, sortDir])

  const sorted = useMemo(() => {
    if (sortField === 'index') return results
    const col = ALL_COLUMNS.find((c) => c.id === sortField)
    if (!col) return results
    return [...results].sort((a, b) => {
      const va = col.getValue(a)
      const vb = col.getValue(b)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [results, sortField, sortDir])

  const effectivePageSize = pageSize === 'All' ? sorted.length : pageSize
  const totalPages = Math.max(1, Math.ceil(sorted.length / (effectivePageSize || 1)))
  const safePage = Math.min(page, totalPages)
  const pageData = sorted.slice((safePage - 1) * (effectivePageSize || 1), safePage * (effectivePageSize || 1))
  const pageOffset = (safePage - 1) * (effectivePageSize || 1)

  const suggestions = useMemo(() => {
    if (!activeFilterCol) return []
    const col = COLUMN_DEFS.find((c) => c.id === activeFilterCol)
    if (!col?.filterable) return []
    const currentVal = (columnFilters[activeFilterCol] ?? '').toLowerCase()
    const unique = [...new Set(results.map((r) => col.getValue(r)).filter(Boolean).map(String))]
    return unique
      .filter((v) => !currentVal || v.toLowerCase().includes(currentVal))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .slice(0, 10)
  }, [activeFilterCol, columnFilters, results, COLUMN_DEFS])

  const allFilteredUrls = useMemo(() => new Set(sorted.map((r) => r.url)), [sorted])
  const allSelected = allFilteredUrls.size > 0 && [...allFilteredUrls].every((u) => selectedUrls.has(u))
  const someSelected = !allSelected && [...allFilteredUrls].some((u) => selectedUrls.has(u))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange(new Set([...selectedUrls].filter((u) => !allFilteredUrls.has(u))))
    } else {
      onSelectionChange(new Set([...selectedUrls, ...allFilteredUrls]))
    }
  }, [allSelected, allFilteredUrls, selectedUrls, onSelectionChange])

  const toggleRow = useCallback((url) => {
    const next = new Set(selectedUrls)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    onSelectionChange(next)
  }, [selectedUrls, onSelectionChange])

  function handleSort(fieldId) {
    if (sortField === fieldId) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(fieldId); setSortDir('asc') }
  }

  function toggleFilter(colId) {
    setActiveFilterCol((prev) => prev === colId ? null : colId)
  }

  function setFilter(colId, val) {
    onColumnFiltersChange({ ...columnFilters, [colId]: val })
  }

  function clearFilter(colId) {
    const n = { ...columnFilters }
    delete n[colId]
    onColumnFiltersChange(n)
  }

  function toggleColVisibility(colId) {
    setVisibleColIds((prev) => {
      const next = new Set(prev)
      if (next.has(colId)) { if (next.size > 1) next.delete(colId) }
      else next.add(colId)
      return next
    })
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg gap-2">
        <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span>No results yet — run a scan to get started</span>
      </div>
    )
  }

  const hasColumnFilters = Object.keys(columnFilters).some((k) => columnFilters[k])

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Active filter chips */}
      {hasColumnFilters && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
          <span className="text-xs text-blue-600 font-medium">Filters:</span>
          {COLUMN_DEFS.filter((c) => columnFilters[c.id]).map((col) => (
            <span key={col.id} className="inline-flex items-center gap-1 text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
              <span className="font-medium">{col.label}:</span> {columnFilters[col.id]}
              <button onClick={() => clearFilter(col.id)} className="text-blue-400 hover:text-blue-700 ml-0.5">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button onClick={() => onColumnFiltersChange({})} className="text-xs text-blue-500 hover:text-blue-700 underline ml-auto">
            Clear all
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="grid bg-gray-50 border-b border-gray-200 relative" style={{ gridTemplateColumns: GRID_COLS, zIndex: 10 }}>
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected }}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 text-right flex items-center justify-end">#</div>

        {COLUMN_DEFS.map((col) => (
          <HeaderCell
            key={col.id}
            col={col}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            isFilterOpen={activeFilterCol === col.id}
            onToggleFilter={toggleFilter}
            filterValue={columnFilters[col.id] ?? ''}
            onFilterChange={(v) => setFilter(col.id, v)}
            onFilterClear={() => clearFilter(col.id)}
            suggestions={activeFilterCol === col.id ? suggestions : []}
            onSuggestionSelect={(v) => { setFilter(col.id, v); setActiveFilterCol(null) }}
            popoverRef={activeFilterCol === col.id ? popoverRef : null}
          />
        ))}

        {/* Redirect header + column toggle button */}
        <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
          <span>Redir</span>
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setShowColumnToggle((s) => !s)}
              title="Toggle columns"
              className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
            {showColumnToggle && (
              <ColumnToggleMenu
                columns={ALL_COLUMNS}
                visibleIds={visibleColIds}
                onToggle={toggleColVisibility}
                onClose={() => setShowColumnToggle(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Data rows */}
      <div className="overflow-auto max-h-[600px] scrollbar-thin">
        {pageData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <span>No results match your filters.</span>
            <button
              onClick={() => onColumnFiltersChange({})}
              className="text-blue-500 hover:text-blue-700 text-xs underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          pageData.map((result, idx) => {
            const badge = GROUP_BADGE[result.group] ?? GROUP_BADGE.failed
            const globalIdx = pageOffset + idx
            const isSelected = selectedUrls.has(result.url)
            const stateBadge = result.urlState ? URL_STATE_BADGE[result.urlState] : null
            const isRemoved = result.urlState === 'removed'

            return (
              <div
                key={`${result.url}-${globalIdx}`}
                className={`grid border-b border-gray-100 transition-colors ${
                  isSelected
                    ? 'bg-blue-50'
                    : isRemoved
                      ? 'bg-gray-50/70 opacity-60'
                      : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/50' : 'bg-gray-50/50 hover:bg-blue-50/50'
                }`}
                style={{ gridTemplateColumns: GRID_COLS, height: ROW_HEIGHT }}
              >
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(result.url)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                <div className="px-3 flex items-center justify-end text-xs text-gray-400 tabular-nums">
                  {globalIdx + 1}
                </div>

                {/* Visible columns rendered in order */}
                {COLUMN_DEFS.map((col) => {
                  if (col.id === 'url') return (
                    <div key="url" className="px-3 flex items-center gap-2 min-w-0">
                      {stateBadge && (
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${stateBadge.bg} ${stateBadge.text}`}>
                          {stateBadge.label}
                        </span>
                      )}
                      <a
                        href={result.link || result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={result.link || result.url}
                        className={`text-sm truncate hover:underline capitalize ${isRemoved ? 'text-gray-400' : 'text-blue-700'}`}
                      >
                        {result.displayUrl || pageName(result.url)}
                      </a>
                    </div>
                  )
                  if (col.id === 'statusCode') return (
                    <div key="statusCode" className="px-3 flex items-center justify-end gap-2">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[result.group] ?? 'bg-gray-300'}`} />
                      <span className="text-sm font-mono tabular-nums font-medium text-gray-800">
                        {result.statusCode || '—'}
                      </span>
                    </div>
                  )
                  if (col.id === 'group') return (
                    <div key="group" className="px-3 flex items-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                  )
                  if (col.id === 'responseTime') return (
                    <div key="responseTime" className="px-3 flex items-center justify-end">
                      <span className={`text-xs tabular-nums font-medium ${responseTimeColor(result.responseTime)}`}>
                        {result.responseTime > 0 ? `${result.responseTime.toLocaleString()} ms` : '—'}
                      </span>
                    </div>
                  )
                  if (col.id === 'deviceId') return (
                    <div key="deviceId" className="px-3 flex items-center">
                      <span className="text-xs text-gray-600 truncate font-mono">{result.deviceId ?? ''}</span>
                    </div>
                  )
                  return (
                    <div key={col.id} className="px-3 flex items-center">
                      <span className="text-xs text-gray-600 truncate">{col.getValue(result)}</span>
                    </div>
                  )
                })}

                {/* Redirect */}
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
                  {result.errorReason && !result.finalUrl && (
                    <span
                      title={result.errorReason}
                      className="text-[10px] text-gray-400 truncate"
                    >
                      {result.errorReason}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        total={sorted.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />
    </div>
  )
}
