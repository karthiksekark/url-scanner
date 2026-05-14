import type { Settings, UrlResult } from './types'
import { DEFAULT_SETTINGS } from './types'

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  return { ...DEFAULT_SETTINGS, ...(result.settings as Partial<Settings> | undefined) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings })
}

export async function getScanResults(): Promise<{ results: UrlResult[]; scannedAt?: number }> {
  const result = await chrome.storage.local.get(['scanResults', 'scanScannedAt'])
  return {
    results: (result.scanResults as UrlResult[] | undefined) ?? [],
    scannedAt: result.scanScannedAt as number | undefined,
  }
}

export async function saveScanResults(results: UrlResult[], scannedAt: number): Promise<void> {
  // chrome.storage.local limit is 10MB; store in chunks if needed
  await chrome.storage.local.set({ scanResults: results, scanScannedAt: scannedAt })
}

export async function clearScanResults(): Promise<void> {
  await chrome.storage.local.remove(['scanResults', 'scanScannedAt'])
}
