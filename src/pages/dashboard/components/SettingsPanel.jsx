import { useState } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/types.js'

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
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
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const endpoint = new URL(form.apiEndpoint)
      endpoint.searchParams.set(form.pageParam, '1')
      endpoint.searchParams.set(form.limitParam, '1')

      const headers = {}
      for (const { key, value } of form.customHeaders) {
        if (key.trim()) headers[key.trim()] = value
      }

      const res = await fetch(endpoint.toString(), { credentials: 'include', headers })
      if (!res.ok) {
        setTestResult(`API returned ${res.status} ${res.statusText}`)
        return
      }
      const data = await res.json()
      setTestResult(`✓ Success — ${JSON.stringify(data).slice(0, 120)}…`)
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
    const updated = form.customHeaders.map((h, idx) => idx === i ? { ...h, [field]: val } : h)
    update('customHeaders', updated)
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* API */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b">API Configuration</h2>
        <div className="space-y-4">
          <Field label="API Endpoint URL" hint="The base URL of your paginated URL list API">
            <input
              type="url"
              value={form.apiEndpoint}
              onChange={(e) => update('apiEndpoint', e.target.value)}
              placeholder="https://api.example.com/urls"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Page param name" hint="Query param for page number">
              <input type="text" value={form.pageParam}
                onChange={(e) => update('pageParam', e.target.value)}
                placeholder="page" className={inputCls} />
            </Field>
            <Field label="Limit param name" hint="Query param for page size">
              <input type="text" value={form.limitParam}
                onChange={(e) => update('limitParam', e.target.value)}
                placeholder="limit" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Page size" hint="Number of items per API page">
              <input type="number" min={1} max={1000} value={form.pageSize}
                onChange={(e) => update('pageSize', Number(e.target.value))}
                className={inputCls} />
            </Field>
            <Field label="URL field name" hint="The key in each object that holds the URL">
              <input type="text" value={form.urlField}
                onChange={(e) => update('urlField', e.target.value)}
                placeholder="url" className={inputCls} />
            </Field>
          </div>

          <Field
            label="Data path (optional)"
            hint='Dot-notation path to the array in the response. E.g. "data" or "results.items". Leave blank if root is the array.'
          >
            <input type="text" value={form.dataPath}
              onChange={(e) => update('dataPath', e.target.value)}
              placeholder="data" className={inputCls} />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Custom request headers</label>
              <button onClick={addHeader} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Add header
              </button>
            </div>
            {form.customHeaders.length === 0 && (
              <p className="text-sm text-gray-400 italic">
                No custom headers. Session cookies are sent automatically.
              </p>
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

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={!form.apiEndpoint || testing}
              className="px-4 py-2 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <span className={`text-xs break-all ${testResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {testResult}
              </span>
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
