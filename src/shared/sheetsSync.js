const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

const HEADERS = [
  'URL', 'Display URL', 'Link', 'ID', 'Device ID',
  'Device Type', 'Product Type', 'Brand',
  'Status Code', 'Status Text', 'Group', 'Response Time (ms)',
  'Final URL', 'Checked At', 'URL State',
]

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
    String(r.statusCode || ''),
    r.statusText ?? '',
    r.group ?? '',
    String(r.responseTime ?? ''),
    r.finalUrl ?? '',
    r.checkedAt ? new Date(r.checkedAt).toISOString() : '',
    r.urlState ?? '',
  ]
}

function rowToResult(row) {
  const [url, displayUrl, link, id, deviceId, deviceType, productType, brand, statusCode, statusText, group, responseTime, finalUrl, checkedAt, urlState] = row
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
    statusCode: Number(statusCode) || 0,
    statusText: statusText || '',
    group: group || 'pending',
    responseTime: Number(responseTime) || 0,
    finalUrl: finalUrl || undefined,
    checkedAt: checkedAt ? new Date(checkedAt).getTime() : 0,
    urlState: urlState || 'stale',
  }
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

export async function pullFromSheets(sheetId) {
  const token = await getAuthToken(false)
  const data = await apiFetch(
    `${SHEETS_API}/${sheetId}/values/Sheet1!A1:O`,
    {},
    token
  )
  const rows = data.values ?? []
  if (rows.length < 2) return []
  return rows.slice(1).map(rowToResult).filter(Boolean)
}

export async function pushToSheets(sheetId, results) {
  const token = await getAuthToken(false)
  const rows = [HEADERS, ...results.map(resultToRow)]
  await apiFetch(
    `${SHEETS_API}/${sheetId}/values/Sheet1!A1:O?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range: 'Sheet1!A1:O',
        majorDimension: 'ROWS',
        values: rows,
      }),
    },
    token
  )
}
