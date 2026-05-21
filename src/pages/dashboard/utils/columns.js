export const GROUP_BADGE = {
  up:           { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Up' },
  redirected:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Redirected' },
  client_error: { bg: 'bg-orange-100', text: 'text-orange-700', label: '4xx Error' },
  server_error: { bg: 'bg-red-100',    text: 'text-red-700',    label: '5xx Error' },
  failed:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Failed' },
  timeout:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Timeout' },
  pending:      { bg: 'bg-blue-50',    text: 'text-blue-500',   label: 'Pending' },
}

export function pageName(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? ''
    return last.replace(/-/g, ' ') || url
  } catch {
    return url
  }
}

export const ALL_COLUMNS = [
  { id: 'url',          label: 'URL',          sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => r.displayUrl || pageName(r.url) },
  { id: 'deviceType',   label: 'Device Type',  sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => r.deviceType ?? '' },
  { id: 'productType',  label: 'Product Type', sortable: true,  filterable: true,  defaultVisible: false, getValue: (r) => r.productType ?? '' },
  { id: 'brand',        label: 'Brand',        sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => r.brand ?? '' },
  { id: 'deviceId',     label: 'Device ID',    sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => r.deviceId ?? '' },
  { id: 'eolType',      label: 'EOL',          sortable: true,  filterable: true,  defaultVisible: false, getValue: (r) => r.eolType ?? '' },
  { id: 'statusCode',   label: 'Status',       sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => String(r.statusCode || '') },
  { id: 'group',        label: 'Group',        sortable: true,  filterable: true,  defaultVisible: true,  getValue: (r) => GROUP_BADGE[r.group]?.label ?? r.group },
  { id: 'responseTime', label: 'Response',     sortable: true,  filterable: false, defaultVisible: true,  getValue: (r) => r.responseTime },
]
