import { useState, useEffect } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/types.js'
import { connectSheets, disconnectSheets, isConnected } from '../../../shared/sheetsSync.js'

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[80px]'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${value ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </label>
  )
}

function JsonEditor({ label, value, onChange, hint }) {
  const [error, setError] = useState(null)
  function handleChange(e) {
    const val = e.target.value
    onChange(val)
    try { JSON.parse(val); setError(null) } catch { setError('Invalid JSON') }
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={handleChange}
        className={`${textareaCls} ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        spellCheck={false}
      />
      {error
        ? <p className="mt-1 text-xs text-red-500">{error}</p>
        : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

const CONCURRENCY_PRESETS = [
  { label: 'Safe', value: 10, hint: 'Low risk of rate-limiting' },
  { label: 'Fast', value: 50, hint: 'Balanced' },
  { label: 'Max', value: 150, hint: 'Use with caution' },
]

const INTERVAL_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
]

export function SettingsPanel({ settings, onSave }) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [sheetsConnected, setSheetsConnected] = useState(false)
  const [sheetsConnecting, setSheetsConnecting] = useState(false)
  const [sheetsError, setSheetsError] = useState(null)
  const [sheetsTitle, setSheetsTitle] = useState(null)

  useEffect(() => { isConnected().then(setSheetsConnected) }, [])

  function update(key, value) {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    onSave(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // Tell the service worker to update the schedule alarm
    chrome.runtime.sendMessage({ type: 'UPDATE_SCHEDULE', settings: form }).catch(() => {})
  }

  function handleReset() {
    setForm(DEFAULT_SETTINGS)
    setSaved(false)
    setTestResult(null)
    setSheetsError(null)
    setSheetsTitle(null)
  }

  async function testRequest(payload, label) {
    const headers = { 'Content-Type': 'application/json' }
    for (const { key, value } of form.customHeaders) {
      if (key.trim()) headers[key.trim()] = value
    }
    let url, fetchOptions
    if (form.method === 'POST') {
      url = form.apiEndpoint
      fetchOptions = { method: 'POST', credentials: 'include', headers, body: payload }
    } else {
      const endpoint = new URL(form.apiEndpoint)
      try {
        const params = JSON.parse(payload || '{}')
        for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, String(v))
      } catch { /* ignore */ }
      url = endpoint.toString()
      fetchOptions = { method: 'GET', credentials: 'include', headers }
    }
    const res = await fetch(url, fetchOptions)
    if (!res.ok) return `${label}: API returned ${res.status} ${res.statusText}`
    const data = await res.json()
    const entries = typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : []
    const count = entries.length
    const base = (form.siteBaseUrl ?? '').replace(/\/+$/, '')
    const samples = entries.slice(0, 3).map(([path]) => base + path).join('\n  ')
    return `✓ ${label}: ${count} URLs${samples ? `\n  ${samples}${count > 3 ? '\n  …' : ''}` : ''}`
  }

  async function handleTest() {
    if (!form.apiEndpoint) return
    setTesting(true)
    setTestResult(null)
    try {
      const r1 = await testRequest(form.payload1, 'Request 1')
      let r2 = null
      if (form.enableRequest2) r2 = await testRequest(form.payload2, 'Request 2')
      setTestResult([r1, r2].filter(Boolean).join('\n\n'))
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : 'Request failed'}`)
    } finally {
      setTesting(false)
    }
  }

  async function handleSheetsConnect() {
    if (!form.sheetsId) return
    setSheetsConnecting(true)
    setSheetsError(null)
    try {
      const title = await connectSheets(form.sheetsId)
      setSheetsConnected(true)
      setSheetsTitle(title)
    } catch (err) {
      setSheetsError(err.message)
    } finally {
      setSheetsConnecting(false)
    }
  }

  async function handleSheetsDisconnect() {
    await disconnectSheets()
    setSheetsConnected(false)
    setSheetsTitle(null)
  }

  function addHeader() {
    update('customHeaders', [...form.customHeaders, { key: '', value: '' }])
  }

  function removeHeader(i) {
    update('customHeaders', form.customHeaders.filter((_, idx) => idx !== i))
  }

  function updateHeader(i, field, val) {
    update('customHeaders', form.customHeaders.map((h, idx) => idx === i ? { ...h, [field]: val } : h))
  }

  function handleExportSettings() {
    const { sheetsId: _, ...exportable } = form
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'url-scanner-settings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportSettings(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result)
        setForm((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...imported }))
        setSaved(false)
      } catch {
        alert('Invalid settings file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const isPost = form.method === 'POST'
  const payloadLabel = isPost ? 'JSON body' : 'Query params (as JSON)'
  const payloadHint = isPost
    ? 'Sent as the request body with Content-Type: application/json'
    : 'Keys and values are appended as ?key=value to the URL'

  return (
    <div className="max-w-2xl space-y-8">

      {/* API */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">API Configuration</h2>
        <div className="space-y-5">

          <Field label="API Endpoint URL" hint="Used for URL-fetch requests and brand lookups">
            <input type="url" value={form.apiEndpoint}
              onChange={(e) => update('apiEndpoint', e.target.value)}
              placeholder="https://api.example.com/urls"
              className={inputCls} />
          </Field>

          <Field label="Site base URL" hint="Prepended to each path from the API response (e.g. https://example.com)">
            <input type="url" value={form.siteBaseUrl}
              onChange={(e) => update('siteBaseUrl', e.target.value)}
              placeholder="https://example.com"
              className={inputCls} />
          </Field>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              {['GET', 'POST'].map((m) => (
                <button key={m} onClick={() => update('method', m)}
                  className={`px-6 py-2 text-sm font-medium transition-colors ${form.method === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
              <span className="text-sm font-semibold text-gray-800">Request 1</span>
            </div>
            <JsonEditor label={payloadLabel} value={form.payload1} onChange={(v) => update('payload1', v)} hint={payloadHint} />
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold">2</span>
                <span className="text-sm font-semibold text-gray-800">Request 2</span>
              </div>
              <Toggle value={form.enableRequest2} onChange={(v) => update('enableRequest2', v)} label="Enable" />
            </div>
            {form.enableRequest2 ? (
              <JsonEditor label={payloadLabel} value={form.payload2} onChange={(v) => update('payload2', v)} hint={payloadHint} />
            ) : (
              <p className="text-xs text-gray-400 italic">Request 2 disabled — only Request 1 will be used.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Custom request headers</label>
              <button onClick={addHeader} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add header</button>
            </div>
            {form.customHeaders.length === 0 && (
              <p className="text-sm text-gray-400 italic">No custom headers. Session cookies are sent automatically.</p>
            )}
            <div className="space-y-2">
              {form.customHeaders.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={h.key}
                    onChange={(e) => updateHeader(i, 'key', e.target.value)}
                    onBlur={(e) => updateHeader(i, 'key', e.target.value.trim())}
                    placeholder="Header name" className={`${inputCls} flex-1`} />
                  <input type="text" value={h.value}
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                    placeholder="Value" className={`${inputCls} flex-1`} />
                  <button onClick={() => removeHeader(i)} className="px-2 text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button onClick={handleTest} disabled={!form.apiEndpoint || testing}
              className="px-4 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <pre className={`text-xs whitespace-pre-wrap rounded-lg p-3 border ${testResult.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                {testResult}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* Google Sheets */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">Google Sheets Sync</h2>
        <div className="space-y-5">

          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700 space-y-1">
            <p className="font-medium">Setup required before connecting:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
              <li>Create a Google Cloud project and enable the Sheets API</li>
              <li>Create OAuth 2.0 credentials (type: Chrome App) and add your extension ID</li>
              <li>Add the client_id to <code className="bg-blue-100 px-1 rounded">manifest.json</code> under the <code className="bg-blue-100 px-1 rounded">oauth2</code> key</li>
              <li>Create a Google Sheet and paste its ID below</li>
            </ol>
          </div>

          <Field label="Google Sheet ID" hint="The long ID string from your sheet's URL">
            <input type="text" value={form.sheetsId}
              onChange={(e) => update('sheetsId', e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className={inputCls} />
          </Field>

          <Field label="Sheet tab name" hint="The tab to read/write (default: Sheet1)">
            <input type="text" value={form.sheetsTabName ?? 'Sheet1'}
              onChange={(e) => update('sheetsTabName', e.target.value)}
              placeholder="Sheet1"
              className={inputCls} />
          </Field>

          <div className="flex items-center gap-3">
            {sheetsConnected ? (
              <>
                <span className="flex items-center gap-1.5 text-sm text-green-700">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Connected{sheetsTitle ? ` — ${sheetsTitle}` : ''}
                </span>
                <button onClick={handleSheetsDisconnect}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                  Disconnect
                </button>
              </>
            ) : (
              <button onClick={handleSheetsConnect} disabled={!form.sheetsId || sheetsConnecting}
                className="px-4 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {sheetsConnecting ? 'Connecting…' : 'Connect to Sheets'}
              </button>
            )}
          </div>

          {sheetsError && <p className="text-xs text-red-600">{sheetsError}</p>}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Auto-sync after each scan</span>
            <Toggle value={form.autoSyncSheets !== false} onChange={(v) => update('autoSyncSheets', v)} />
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">Scheduled Scan</h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">Enable scheduled scanning</div>
              <div className="text-xs text-gray-400">Runs automatically in the background</div>
            </div>
            <Toggle value={!!form.scheduleEnabled} onChange={(v) => update('scheduleEnabled', v)} />
          </div>

          {form.scheduleEnabled && (
            <>
              <Field label="Scan interval">
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => update('scheduleIntervalHours', opt.value)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.scheduleIntervalHours === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Preferred time of day" hint="Leave empty to run at any time. Use 24h format (e.g. 02:00 for 2 AM).">
                <input
                  type="time"
                  value={form.scheduleTimeOfDay ?? ''}
                  onChange={(e) => update('scheduleTimeOfDay', e.target.value)}
                  className={`${inputCls} max-w-[160px]`}
                />
              </Field>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-700">Run only when idle</div>
                  <div className="text-xs text-gray-400">Waits until no mouse/keyboard activity for 2 min</div>
                </div>
                <Toggle value={!!form.scheduleIdleOnly} onChange={(v) => update('scheduleIdleOnly', v)} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Performance */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">Performance</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Concurrency: {form.concurrency} simultaneous requests
            </label>
            <div className="flex gap-2 mb-3">
              {CONCURRENCY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => update('concurrency', p.value)}
                  title={p.hint}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    form.concurrency === p.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {p.label} ({p.value})
                </button>
              ))}
            </div>
            <input type="range" min={1} max={200} value={form.concurrency}
              onChange={(e) => update('concurrency', Number(e.target.value))}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span><span>200</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={`Timeout: ${form.timeoutMs / 1000}s`} hint="Per-URL timeout before marking as Timeout">
              <input type="range" min={1000} max={60000} step={1000} value={form.timeoutMs}
                onChange={(e) => update('timeoutMs', Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1s</span><span>60s</span>
              </div>
            </Field>
            <Field label={`Staleness: ${form.stalenessHours}h`} hint="Results older than this are marked stale">
              <input type="range" min={1} max={24} step={1} value={form.stalenessHours}
                onChange={(e) => update('stalenessHours', Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1h</span><span>24h</span>
              </div>
            </Field>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3">
          <button onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            {saved ? '✓ Saved' : 'Save settings'}
          </button>
          <button onClick={handleReset}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
            Reset to defaults
          </button>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleExportSettings}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            Export settings
          </button>
          <label className="text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer">
            Import settings
            <input type="file" accept=".json" onChange={handleImportSettings} className="sr-only" />
          </label>
        </div>
      </div>
    </div>
  )
}
