import { getSettings } from '../shared/storage.js'
import { getAllResults, saveResults, setMeta, appendScanHistory, getScanHistory } from '../shared/db.js'
import { fetchAllUrls, checkUrl, runConcurrent, prefetchBrandData } from '../pages/dashboard/utils/urlChecker.js'
import { computeSummary, computeUrlState } from '../shared/types.js'
import { pushToSheets } from '../shared/sheetsSync.js'

const ALARM_NAME = 'url-scanner-scheduled'
const RETRY_ALARM_NAME = 'url-scanner-scheduled-retry'

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})

// ── Schedule Management ───────────────────────────────────────────────────────

// Called when settings are saved — updates the alarm to match new schedule.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_SCHEDULE') {
    updateScheduleAlarm(msg.settings).catch(console.error)
  }
})

async function updateScheduleAlarm(settings) {
  await chrome.alarms.clearAll()
  if (!settings?.scheduleEnabled) return

  const intervalMinutes = (settings.scheduleIntervalHours ?? 24) * 60

  if (settings.scheduleTimeOfDay) {
    const [hours, minutes] = settings.scheduleTimeOfDay.split(':').map(Number)
    const now = new Date()
    const target = new Date()
    target.setHours(hours, minutes, 0, 0)
    if (target <= now) target.setDate(target.getDate() + 1)
    const delayInMinutes = (target - now) / 60000
    chrome.alarms.create(ALARM_NAME, { delayInMinutes, periodInMinutes: intervalMinutes })
  } else {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes })
  }
}

// On install / update — restore schedule from saved settings
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await getSettings()
    await updateScheduleAlarm(settings)
  } catch {
    // best-effort
  }
})

// ── Alarm Listener ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME && alarm.name !== RETRY_ALARM_NAME) return

  const settings = await getSettings()
  if (!settings.scheduleEnabled) return

  if (settings.scheduleIdleOnly) {
    const idleState = await new Promise((r) => chrome.idle.queryState(120, r))
    if (idleState !== 'idle') {
      // Retry in 10 minutes when the main scheduled alarm fires at the wrong time
      if (alarm.name === ALARM_NAME) {
        chrome.alarms.create(RETRY_ALARM_NAME, { delayInMinutes: 10 })
      }
      return
    }
  }

  try {
    await runScheduledScan(settings)
  } catch (err) {
    console.error('[scheduled-scan] failed:', err)
  }
})

// ── Scheduled Scan ────────────────────────────────────────────────────────────

async function runScheduledScan(settings) {
  const controller = new AbortController()
  const signal = controller.signal
  const startedAt = Date.now()

  let fetchedCount = 0
  const tagged = await fetchAllUrls(settings, signal, (c) => { fetchedCount = c })
  if (signal.aborted || tagged.length === 0) return

  const brandMap = await prefetchBrandData(settings.apiEndpoint, tagged, signal)
  if (signal.aborted) return

  const resultsMap = new Map()

  function firstPathSegment(url) {
    try { return new URL(url).pathname.split('/').filter(Boolean)[0] ?? '' } catch { return '' }
  }

  const items = tagged.map(({ url, id, source }) => ({
    url, id,
    deviceType: source === 1 ? 'devices' : 'accy',
    productType: firstPathSegment(url),
  }))

  await runConcurrent(
    items,
    settings.concurrency,
    ({ url, id, deviceType, productType }) => {
      const brandData = brandMap.get(id) ?? null
      return checkUrl(url, settings.timeoutMs, signal, brandData)
    },
    (result, { id, deviceType, productType }) => {
      if (signal.aborted) return
      resultsMap.set(result.url, {
        deviceType, productType, eolType: '', ...result, id, urlState: 'fresh',
      })
    },
    signal
  )

  if (signal.aborted) return

  const finalResults = [...resultsMap.values()]
  const summary = computeSummary(finalResults)
  const completedAt = Date.now()

  await Promise.all([
    saveResults(finalResults),
    setMeta('lastScannedAt', completedAt),
    appendScanHistory({
      scanId: `scan-${startedAt}`,
      startedAt,
      completedAt,
      isPartial: false,
      summary,
      delta: { newFailures: [], recovered: [], newUrls: [] },
    }),
  ])

  // Push to Sheets if configured
  if (settings.sheetsId && settings.autoSyncSheets !== false) {
    try {
      await pushToSheets(settings.sheetsId, finalResults, settings.sheetsTabName)
      await setMeta('sheetsLastSyncAt', Date.now())
    } catch (err) {
      console.warn('[scheduled-scan] Sheets push failed:', err.message)
    }
  }

  // Fire notification if there are failures
  const failureCount = summary.failed + summary.timeout
  if (failureCount > 0) {
    chrome.notifications.create(`scan-${startedAt}`, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'URL Scanner — Scan Complete',
      message: `${failureCount.toLocaleString()} URL${failureCount !== 1 ? 's' : ''} are failing or timed out. Open the scanner to view details.`,
      priority: 1,
    })
  }
}

// Clicking a notification opens the dashboard
chrome.notifications.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
