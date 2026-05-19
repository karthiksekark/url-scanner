import { useState, useMemo, useEffect, useRef, useCallback } from 'react'

const GROUP_BADGE = {
  up:           { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Up' },
  redirected:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Redirected' },
  client_error: { bg: 'bg-orange-100', text: 'text-orange-700', label: '4xx Error' },
  server_error: { bg: 'bg-red-100',    text: 'text-red-700',    label: '5xx Error' },
  failed:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Failed' },
  timeout:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Timeout' },
  pending:      { bg: 'bg-blue-50',    text: 'text-blue-500',   label: 'Pending' },
}

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

// checkbox | # | URL | Device Type | Product Type | Brand | Status | Group | Response | Redirect
const GRID_COLS = '2rem 3rem 1fr 7rem 8rem 7rem 6rem 8rem 7rem 5rem'

const COLUMN_DEFS = [
  { id: 'url',          label: 'URL',          sortable: true,  filterable: true,  getValue: (r) => pageName(r.url) },
  { id: 'deviceType',   label: 'Device Type',  sortable: true,  filterable: true,  getValue: (r) => r.deviceType ?? '' },
  { id: 'productType',  label: 'Product Type', sortable: true,  filterable: true,  getValue: (r) => r.productType ?? '' },
  { id: 'brand',        label: 'Brand',        sortable: true,  filterable: true,  getValue: (r) => r.brand ?? '' },
  { id: 'statusCode',   label: 'Status',       sortable: true,  filterable: true,  getValue: (r) => String(r.statusCode || '') },
  { id: 'group',        label: 'Group',        sortable: true,  filterable: true,  getValue: (r) => GROUP_BADGE[r.group]?.label ?? r.group },
  { id: 'responseTime', label: 'Response',     sortable: true,  filterable: false, getValue: (r) => r.responseTime },
]

function pageName(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? ''
    return last.replace(/-/g, ' ') || url
  } catch {
    return url
  }
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
    if (e.key === 'Enter' && suggestions.length > 0 && !suggestions.includes(filterValue)) {
      onSuggestionSelect(suggestions[0])
    }
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
        <div
          ref={popoverRef}
          className="absolute top-full left-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl"
          style={{ minWidth: 190 }}
        >
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
              <button onClick={onFilterClear} className="text-gray-400 hover:text-red-500 transition-colors" title="Clear">
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
        <span className="text-sm text-gray-500 whitespace-nowrap">Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(e.target.value === 'All' ? 'All' : Number(e.target.value))}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <span className="text-sm text-gray-500 whitespace-nowrap order-last sm:order-none">
        {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className={`${btnBase} border-gray-300 disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed`}
          >
            ‹
          </button>
          {pageNumbers().map((p, i) =>
            typeof p === 'string' ? (
              <span key={`e${i}`} className="px-1 text-sm text-gray-400">{p}</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`${btnBase} ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}
              >
                {p}
              </button>
            )
          )}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className={`${btnBase} border-gray-300 disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed`}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

export function UrlTable({ results, selectedUrls, onSelectionChange }) {
  const [sortField, setSortField] = useState('index')
  const [sortDir, setSortDir] = useState('asc')
  const [activeFilterCol, setActiveFilterCol] = useState(null)
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!activeFilterCol) return
    function onMouseDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setActiveFilterCol(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [activeFilterCol])

  useEffect(() => { setPage(1) }, [filters, sortField, sortDir])

  const filtered = useMemo(() => {
    const activeFilters = COLUMN_DEFS.filter((c) => c.filterable && filters[c.id])
    if (activeFilters.length === 0) return results
    return results.filter((r) =>
      activeFilters.every((col) =>
        col.getValue(r).toString().toLowerCase().includes(filters[col.id].toLowerCase())
      )
    )
  }, [results, filters])

  const sorted = useMemo(() => {
    if (sortField === 'index') return filtered
    const col = COLUMN_DEFS.find((c) => c.id === sortField)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const va = col.getValue(a)
      const vb = col.getValue(b)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  const effectivePageSize = pageSize === 'All' ? sorted.length : pageSize
  const totalPages = Math.max(1, Math.ceil(sorted.length / (effectivePageSize || 1)))
  const pageData = sorted.slice((page - 1) * (effectivePageSize || 1), page * (effectivePageSize || 1))
  const pageOffset = (page - 1) * (effectivePageSize || 1)

  const suggestions = useMemo(() => {
    if (!activeFilterCol) return []
    const col = COLUMN_DEFS.find((c) => c.id === activeFilterCol)
    if (!col) return []
    const currentVal = (filters[activeFilterCol] ?? '').toLowerCase()
    const unique = [...new Set(results.map((r) => col.getValue(r)).filter(Boolean))]
    return unique
      .filter((v) => !currentVal || v.toString().toLowerCase().includes(currentVal))
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .slice(0, 10)
  }, [activeFilterCol, filters, results])

  // Select-all state based on ALL filtered results (not just current page)
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
    if (sortField === fieldId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(fieldId)
      setSortDir('asc')
    }
  }

  function toggleFilter(colId) {
    setActiveFilterCol((prev) => (prev === colId ? null : colId))
  }

  function setFilter(colId, val) {
    setFilters((prev) => ({ ...prev, [colId]: val }))
  }

  function clearFilter(colId) {
    setFilters((prev) => { const n = { ...prev }; delete n[colId]; return n })
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
        No results to display
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Active filter chips */}
      {Object.keys(filters).some((k) => filters[k]) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
          <span className="text-xs text-blue-600 font-medium">Filters:</span>
          {COLUMN_DEFS.filter((c) => filters[c.id]).map((col) => (
            <span key={col.id} className="inline-flex items-center gap-1 text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
              <span className="font-medium">{col.label}:</span> {filters[col.id]}
              <button onClick={() => clearFilter(col.id)} className="text-blue-400 hover:text-blue-700 ml-0.5">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button onClick={() => setFilters({})} className="text-xs text-blue-500 hover:text-blue-700 underline ml-auto">
            Clear all
          </button>
        </div>
      )}

      {/* Header row */}
      <div
        className="grid bg-gray-50 border-b border-gray-200"
        style={{ gridTemplateColumns: GRID_COLS, position: 'relative', zIndex: 10 }}
      >
        {/* Select-all checkbox */}
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
            filterValue={filters[col.id] ?? ''}
            onFilterChange={(v) => setFilter(col.id, v)}
            onFilterClear={() => clearFilter(col.id)}
            suggestions={activeFilterCol === col.id ? suggestions : []}
            onSuggestionSelect={(v) => { setFilter(col.id, v); setActiveFilterCol(null) }}
            popoverRef={activeFilterCol === col.id ? popoverRef : null}
          />
        ))}

        <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center">
          Redirect
        </div>
      </div>

      {/* Data rows */}
      <div className="overflow-auto max-h-[600px] scrollbar-thin">
        {pageData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No results match your filters
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
                {/* Checkbox */}
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(result.url)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {/* # */}
                <div className="px-3 flex items-center justify-end text-xs text-gray-400 tabular-nums">
                  {globalIdx + 1}
                </div>

                {/* URL — page name as link + urlState badge */}
                <div className="px-3 flex items-center gap-2 min-w-0">
                  {stateBadge && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${stateBadge.bg} ${stateBadge.text}`}>
                      {stateBadge.label}
                    </span>
                  )}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={result.url}
                    className={`text-sm truncate hover:underline capitalize ${isRemoved ? 'text-gray-400' : 'text-blue-700'}`}
                  >
                    {pageName(result.url)}
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

                {/* Brand */}
                <div className="px-3 flex items-center">
                  <span className="text-xs text-gray-600 truncate">{result.brand ?? ''}</span>
                </div>

                {/* Status code */}
                <div className="px-3 flex items-center justify-end gap-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[result.group] ?? 'bg-gray-300'}`} />
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
                </div>
              </div>
            )
          })
        )}
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={sorted.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />
    </div>
  )
}
