const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

const HEADERS = [
  'URL', 'Display URL', 'Link', 'ID', 'Device ID',
  'Device Type', 'Product Type', 'Brand', 'EOL Type',
  'Status Code', 'Status Text', 'Group', 'Response Time (ms)',
  'Final URL', 'Checked At', 'URL State', 'Error Reason',
]

// Column range derived from header count (A–Q for 17 columns)
function colLetter(n) {
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(64 + (n % 26 || 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
const DATA_RANGE_COLS = `A:${colLetter(HEADERS.length)}`

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth failed'))
      } else {
        resolve(token)
      }
    })
  })
}

async function apiFetch(url, options, token) {
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    await new Promise((r) => chrome.identity.removeCachedAuthToken({ token }, r))
    throw new Error('AUTH_EXPIRED')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets API ${res.status}: ${body}`)
  }
  return res.json()
}

function resultToRow(r) {
  return [
    r.url ?? '',
    r.displayUrl ?? '',
    r.link ?? '',
    r.id ?? '',
    r.deviceId ?? '',
    r.deviceType ?? '',
    r.productType ?? '',
    r.brand ?? '',
    r.eolType ?? '',
    String(r.statusCode || ''),
    r.statusText ?? '',
    r.group ?? '',
    String(r.responseTime ?? ''),
    r.finalUrl ?? '',
    r.checkedAt ? new Date(r.checkedAt).toISOString() : '',
    r.urlState ?? '',
    r.errorReason ?? '',
  ]
}

function rowToResult(row) {
  const [
    url, displayUrl, link, id, deviceId,
    deviceType, productType, brand, eolType,
    statusCode, statusText, group, responseTime,
    finalUrl, checkedAt, urlState, errorReason,
  ] = row
  if (!url) return null
  return {
    url,
    displayUrl: displayUrl || '',
    link: link || '',
    id: id || '',
    deviceId: deviceId || '',
    deviceType: deviceType || '',
    productType: productType || '',
    brand: brand || '',
    eolType: eolType || '',
    statusCode: Number(statusCode) || 0,
    statusText: statusText || '',
    group: group || 'pending',
    responseTime: Number(responseTime) || 0,
    finalUrl: finalUrl || undefined,
    checkedAt: checkedAt ? new Date(checkedAt).getTime() : 0,
    urlState: urlState || 'stale',
    errorReason: errorReason || undefined,
  }
}

function tabRange(tabName, cols) {
  const safe = tabName || 'Sheet1'
  return `${safe}!${cols}`
}

export async function connectSheets(sheetId) {
  const token = await getAuthToken(true)
  const data = await apiFetch(`${SHEETS_API}/${sheetId}?fields=properties.title`, {}, token)
  return data.properties?.title ?? 'Connected'
}

export async function isConnected() {
  try {
    await getAuthToken(false)
    return true
  } catch {
    return false
  }
}

export function disconnectSheets() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, resolve)
      } else {
        resolve()
      }
    })
  })
}

export async function pullFromSheets(sheetId, tabName = 'Sheet1') {
  const token = await getAuthToken(false)
  const range = tabRange(tabName, DATA_RANGE_COLS)
  const data = await apiFetch(
    `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(range)}`,
    {},
    token
  )
  const rows = data.values ?? []
  if (rows.length < 2) return []
  return rows.slice(1).map(rowToResult).filter(Boolean)
}

export async function pushToSheets(sheetId, results, tabName = 'Sheet1') {
  const token = await getAuthToken(false)
  const range = tabRange(tabName, DATA_RANGE_COLS)
  const rows = [HEADERS, ...results.map(resultToRow)]
  await apiFetch(
    `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: rows,
      }),
    },
    token
  )
}
