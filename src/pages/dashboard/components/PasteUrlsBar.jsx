import { useState, useCallback } from 'react'

function parseUrls(text) {
  return text
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => {
      try { new URL(s); return true } catch { return false }
    })
}

export function PasteUrlsBar({ onScan, isScanning }) {
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)

  const validUrls = parseUrls(text)
  const hasText = text.trim().length > 0

  const handleScan = useCallback(() => {
    if (validUrls.length === 0 || isScanning) return
    onScan(validUrls)
    setText('')
    setExpanded(false)
  }, [validUrls, isScanning, onScan])

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleScan()
    if (e.key === 'Escape') { setText(''); setExpanded(false) }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full mb-3 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
      >
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Paste URLs to scan…
      </button>
    )
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-700">Scan specific URLs</span>
        <button
          onClick={() => { setText(''); setExpanded(false) }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste one URL per line (or comma/space separated)&#10;Ctrl+Enter to scan"
        rows={4}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {hasText
            ? validUrls.length > 0
              ? `${validUrls.length} valid URL${validUrls.length !== 1 ? 's' : ''} detected`
              : 'No valid URLs detected'
            : 'Enter URLs above'}
        </span>
        <button
          onClick={handleScan}
          disabled={validUrls.length === 0 || isScanning}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isScanning ? (
            <>
              <span className="h-2 w-2 rounded-full bg-white/60 animate-pulse" />
              Scanning…
            </>
          ) : (
            `Scan ${validUrls.length > 0 ? validUrls.length : ''} URL${validUrls.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  )
}
