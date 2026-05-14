import { DEFAULT_SETTINGS } from './types.js'

export async function getSettings() {
  const result = await chrome.storage.sync.get('settings')
  return { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) }
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings })
}

export async function getScanResults() {
  const result = await chrome.storage.local.get(['scanResults', 'scanScannedAt'])
  return {
    results: result.scanResults ?? [],
    scannedAt: result.scanScannedAt,
  }
}

export async function saveScanResults(results, scannedAt) {
  await chrome.storage.local.set({ scanResults: results, scanScannedAt: scannedAt })
}

export async function clearScanResults() {
  await chrome.storage.local.remove(['scanResults', 'scanScannedAt'])
}
