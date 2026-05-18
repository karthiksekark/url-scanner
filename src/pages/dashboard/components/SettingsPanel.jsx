import { useState } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/types.js'

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

const textareaCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[120px]'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function JsonEditor({ label, value, onChange, hint }) {
  const [error, setError] = useState(null)

  function handleChange(e) {
    const val = e.target.value
    onChange(val)
    try {
      JSON.parse(val)
      setError(null)
    } catch {
      setError('Invalid JSON')
    }
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
        : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>
      }
    </div>
  )
}

export function SettingsPanel({ settings, onSave }) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  function update(key, value) {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    onSave(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setForm(DEFAULT_SETTINGS)
    setSaved(false)
    setTestResult(null)
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
    const count = Array.isArray(data) ? data.length : '?'
    return `✓ ${label}: received ${count} URLs`
  }

  async function handleTest() {
    if (!form.apiEndpoint) return
    setTesting(true)
    setTestResult(null)
    try {
      const r1 = await testRequest(form.payload1, 'Request 1')
      let r2 = null
      if (form.enableRequest2) {
        r2 = await testRequest(form.payload2, 'Request 2')
      }
      setTestResult([r1, r2].filter(Boolean).join('\n'))
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setTesting(false)
    }
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

          <Field label="API Endpoint URL" hint="Used for both URL-fetch requests and the per-URL brand lookup">
            <input
              type="url"
              value={form.apiEndpoint}
              onChange={(e) => update('apiEndpoint', e.target.value)}
              placeholder="https://api.example.com/urls"
              className={inputCls}
            />
          </Field>

          <Field label="Site base URL" hint="Prepended to each path key from the API response to build the full URL (e.g. https://example.com)">
            <input
              type="url"
              value={form.siteBaseUrl}
              onChange={(e) => update('siteBaseUrl', e.target.value)}
              placeholder="https://example.com"
              className={inputCls}
            />
          </Field>

          {/* Method toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              {['GET', 'POST'].map((m) => (
                <button
                  key={m}
                  onClick={() => update('method', m)}
                  className={[
                    'px-6 py-2 text-sm font-medium transition-colors',
                    form.method === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Request 1 */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
              <span className="text-sm font-semibold text-gray-800">Request 1</span>
            </div>
            <JsonEditor
              label={payloadLabel}
              value={form.payload1}
              onChange={(v) => update('payload1', v)}
              hint={payloadHint}
            />
          </div>

          {/* Request 2 */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold">2</span>
                <span className="text-sm font-semibold text-gray-800">Request 2</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-gray-500">Enable</span>
                <div
                  onClick={() => update('enableRequest2', !form.enableRequest2)}
                  className={[
                    'relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                    form.enableRequest2 ? 'bg-blue-600' : 'bg-gray-300',
                  ].join(' ')}
                >
                  <span className={[
                    'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                    form.enableRequest2 ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')} />
                </div>
              </label>
            </div>

            {form.enableRequest2 && (
              <JsonEditor
                label={payloadLabel}
                value={form.payload2}
                onChange={(v) => update('payload2', v)}
                hint={payloadHint}
              />
            )}
            {!form.enableRequest2 && (
              <p className="text-xs text-gray-400 italic">Request 2 is disabled — only Request 1 will be used.</p>
            )}
          </div>

          {/* Custom headers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Custom request headers</label>
              <button onClick={addHeader} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Add header
              </button>
            </div>
            {form.customHeaders.length === 0 && (
              <p className="text-sm text-gray-400 italic">No custom headers. Session cookies are sent automatically.</p>
            )}
            <div className="space-y-2">
              {form.customHeaders.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={h.key}
                    onChange={(e) => updateHeader(i, 'key', e.target.value)}
                    placeholder="Header name" className={`${inputCls} flex-1`} />
                  <input type="text" value={h.value}
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                    placeholder="Value" className={`${inputCls} flex-1`} />
                  <button onClick={() => removeHeader(i)} className="px-2 text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Test connection */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleTest}
              disabled={!form.apiEndpoint || testing}
              className="px-4 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <pre className={`text-xs whitespace-pre-wrap ${testResult.includes('✓') && !testResult.split('\n').some(l => !l.startsWith('✓')) ? 'text-green-600' : testResult.startsWith('✓') ? 'text-amber-600' : 'text-red-600'}`}>
                {testResult}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* Performance */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">Performance</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Concurrency: ${form.concurrency}`} hint="Number of URLs checked simultaneously">
            <input type="range" min={1} max={200} value={form.concurrency}
              onChange={(e) => update('concurrency', Number(e.target.value))}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 (safe)</span><span>100</span><span>200 (fast)</span>
            </div>
          </Field>
          <Field label={`Timeout: ${form.timeoutMs / 1000}s`} hint="Per-URL timeout before marking as Timeout">
            <input type="range" min={1000} max={60000} step={1000} value={form.timeoutMs}
              onChange={(e) => update('timeoutMs', Number(e.target.value))}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1s</span><span>30s</span><span>60s</span>
            </div>
          </Field>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
        <button onClick={handleReset}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
