# URL Scanner — Chrome Extension

A Chrome extension for bulk URL health monitoring across large product catalogs. Checks thousands of URLs concurrently, enriches results with brand and device data, tracks EOL status, and syncs to Google Sheets.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Load into Chrome](#load-into-chrome)
- [API Requirements](#api-requirements)
- [Extension Configuration](#extension-configuration)
- [Google Sheets Setup](#google-sheets-setup)
- [Scheduled Scanning](#scheduled-scanning)
- [Using the Scanner](#using-the-scanner)
- [Exporting Results](#exporting-results)
- [Settings Reference](#settings-reference)

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Node.js | 18+ |
| npm | 9+ |
| Google Chrome | 116+ (Manifest V3) |

---

## Installation

**1. Clone the repository**

```bash
git clone <repo-url>
cd url-scanner
```

**2. Install dependencies**

```bash
npm install
```

**3. Build the extension**

```bash
npm run build
```

The compiled extension is output to the `dist/` folder.

> To rebuild automatically during development: `npm run dev`

---

## Load into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project
5. The URL Scanner icon appears in your Chrome toolbar
6. Click the icon — it opens the full-page dashboard

> After any code change, run `npm run build` again and click the **↺ refresh** button on the extension card in `chrome://extensions`.

---

## API Requirements

The extension connects to two API endpoints that you control.

### URL List API

Returns the list of URLs to scan.

**Request (POST example):**
```http
POST https://your-api.example.com/urls
Content-Type: application/json

{}
```

**Expected response format:**
```json
{
  "/laptops/dell-xps-15": "1001",
  "/phones/iphone-15-pro": "1002",
  "/accessories/usb-hub": "1003"
}
```

- Keys are **URL paths** (appended to your Site Base URL to form full URLs)
- Values are **product IDs** used to look up brand data
- Supports GET (query params) or POST (JSON body)
- Supports up to two separate requests (e.g. two product categories)

---

### Brand Enrichment API

Returns product metadata for a batch of IDs.

**Request:**
```http
POST https://your-api.example.com/brand
Content-Type: application/json

{ "ids": ["1001", "1002", "1003"] }
```

**Expected response:**
```json
[
  {
    "id": "1001",
    "brandName": "Dell",
    "url": "/laptops/dell-xps-15",
    "link": "https://example.com/laptops/dell-xps-15",
    "deviceType": "devices",
    "productType": "laptops",
    "deviceId": "DELLXPS15",
    "eolType": ""
  },
  {
    "id": "1002",
    "brandName": "Apple",
    "url": "/phones/iphone-15-pro",
    "link": "https://example.com/phones/iphone-15-pro",
    "deviceType": "devices",
    "productType": "phones",
    "deviceId": "IPH15PRO",
    "eolType": "postpaid"
  }
]
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Must match the ID from the URL list response |
| `brandName` | string | Shown in the Brand column |
| `url` | string | Display path shown in the URL column |
| `link` | string | Full clickable URL (used as the anchor href) |
| `deviceType` | string | Used in sidebar filter and Device Type column |
| `productType` | string | Used in sidebar filter and Product Type column |
| `deviceId` | string | Shown in Device ID column |
| `eolType` | string | `postpaid`, `prepaid`, `accy`, or empty string |

Brand data is **cached in IndexedDB for 24 hours** — the API is only called for uncached IDs or when the cache expires.

---

## Extension Configuration

Open the dashboard and go to the **Settings** tab.

### Step 1 — API Endpoint

| Field | Description |
|-------|-------------|
| **API Endpoint URL** | Single endpoint used for both the URL list requests and brand lookups |
| **Site Base URL** | Prepended to every path from the URL list (e.g. `https://example.com`) |
| **Method** | GET or POST |

### Step 2 — Requests

Configure up to two URL list requests (e.g. one for devices, one for accessories). Each request has its own JSON payload or query params.

Use **Test connection** to validate — it shows the number of URLs returned and three sample URLs so you can verify the base URL is correct.

### Step 3 — Save

Click **Save settings**. The extension immediately loads the URL list and shows the scanner.

---

## Google Sheets Setup

Sheets sync lets you share results with your team and pull historical data across sessions.

### One-time setup (5 minutes)

**1. Create a Google Cloud project**

- Go to [console.cloud.google.com](https://console.cloud.google.com)
- Create a new project (or use an existing one)
- Enable the **Google Sheets API** (APIs & Services → Enable APIs → search "Sheets")

**2. Create OAuth credentials**

- Go to APIs & Services → Credentials → **Create Credentials → OAuth client ID**
- Application type: **Chrome App**
- In the **Application ID** field, enter your extension ID

> Find your extension ID at `chrome://extensions` — it looks like `abcdefghijklmnopabcdefghijklmnop`

- Click **Create** and copy the **Client ID**

**3. Add the Client ID to the extension**

Open `manifest.json` and replace the placeholder:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
}
```

Rebuild the extension (`npm run build`) and reload it in Chrome.

**4. Create a Google Sheet**

- Create a new Google Sheet
- Copy the **Sheet ID** from the URL:
  `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`

**5. Connect in Settings**

- Paste the Sheet ID into the **Google Sheet ID** field
- Set the **Sheet tab name** (default: `Sheet1`) — this is the tab the extension reads/writes
- Click **Connect to Sheets** — Chrome will prompt for Google account access

### Sync behaviour

| Action | What happens |
|--------|-------------|
| After each full scan | Results automatically pushed to Sheets (if Auto-sync is on) |
| On app load | Pulls from Sheets and merges with local results (newer `checkedAt` wins) |
| Manual sync | Click **Sync Sheets** in the toolbar |

The extension writes a header row followed by one data row per URL. **Do not manually edit columns A–Q** — they are overwritten on each push.

---

## Scheduled Scanning

The extension can run scans automatically in the background without the dashboard being open.

Go to **Settings → Scheduled Scan** and configure:

| Setting | Description |
|---------|-------------|
| **Enable scheduled scanning** | Turns scheduling on/off |
| **Scan interval** | How often to run: 1h, 6h, 12h, 24h, or 48h |
| **Preferred time of day** | Optional. Run at a specific clock time (e.g. `02:00` for 2 AM). Leave empty to run at any time. |
| **Run only when idle** | Waits until there has been no mouse or keyboard activity for 2 minutes before starting |

> **Save settings** after changing schedule options — this registers the Chrome alarm immediately.

When a scheduled scan completes and failures are found, Chrome shows a desktop notification. Clicking the notification opens the dashboard.

---

## Using the Scanner

### Running a scan

| Button | What it does |
|--------|-------------|
| **Full Scan** | Fetches the URL list from your API, pre-fetches brand data, then checks every URL |
| **Update List** | Fetches the URL list only — no HTTP checks. Marks new/removed URLs without touching existing results. |
| **Stop** | Stops the current scan. Results collected so far are saved. A "⚠ Scan stopped early" banner is shown. |

A confirmation dialog appears before a Full Scan if results already exist, since it replaces all prior data.

### Status tiles

Click any tile to filter the results table to that group. Click again to clear the filter.

| Tile | Meaning |
|------|---------|
| Total | All URLs in the last scan |
| Up | HTTP 2xx responses |
| Redirected | HTTP 3xx or redirect destination differs from original URL |
| 4xx Errors | Client errors (404, 403, etc.) |
| 5xx Errors | Server errors (500, 502, etc.) |
| Failed | Network error, CORS, DNS failure |
| Timeout | No response within the timeout limit |
| Postpaid EOL | URLs where brand API returned `eolType: "postpaid"` |
| Prepaid EOL | URLs where brand API returned `eolType: "prepaid"` |
| Accy EOL | URLs where brand API returned `eolType: "accy"` |

### Sidebar filters

Click the filter icon (or the collapse button) to toggle the sidebar.

- **Device Type**, **Product Type**, and **Brand** sections each show a list of values with counts
- Check any value to filter the table — multiple values within a section use **OR**, sections use **AND**
- Active filter count is shown as a badge on the sidebar toggle
- **Clear** resets all sidebar filters

Sidebar filters work together with the status tile filter simultaneously.

### Paste URLs to scan

Click **Paste URLs to scan…** (above the results table) to expand the paste bar.

1. Paste any number of URLs (one per line, or comma/space separated)
2. The bar validates and counts recognisable URLs in real time
3. Click **Scan N URLs** (or press Ctrl+Enter) to run a targeted re-check on just those URLs
4. Results are merged back into the existing result set

### Re-check options

| Button | Behaviour |
|--------|-----------|
| **Re-check N failed** | Re-scans all URLs currently in the Failed or Timeout group |
| **Re-check N selected** | Re-scans the rows you have checked with the row checkboxes |

### Scan history

After a scan completes, a **delta banner** shows what changed vs. the previous scan (new failures, recoveries, new URLs).

Click **History** in the toolbar to open the scan history panel — shows the last 5 scans. Select any scan to see its summary and per-URL delta.

### URL state badges

Each row can show a badge indicating its lifecycle state:

| Badge | Meaning |
|-------|---------|
| **New** | URL appeared in the list since the last Update List |
| **Stale** | Last checked longer ago than the staleness threshold |
| **Removed** | URL was in a previous list but is no longer returned by the API |

### Column visibility

Click the columns icon at the top-right of the table header to show/hide columns. Hidden columns are excluded from sorting and filtering but not from exports.

**Default visible columns:** URL, Device Type, Brand, Device ID, Status, Group, Response Time, Redirect

**Hidden by default:** Product Type, EOL Type

### Response time colours

| Colour | Range |
|--------|-------|
| Green | < 500 ms |
| Amber | 500 ms – 2,000 ms |
| Red | > 2,000 ms |

---

## Exporting Results

### CSV export

Click **Export CSV** in the toolbar. Downloads a `.csv` file with one row per URL and the following columns:

`URL · Display URL · Link · ID · Device ID · Device Type · Product Type · Brand · EOL Type · Status Code · Status Text · Group · Response Time (ms) · Final URL · Checked At · URL State · Error Reason`

### Google Sheets

See [Google Sheets Setup](#google-sheets-setup). The extension writes the same columns as the CSV to the configured sheet tab. Existing rows are replaced on each push.

---

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| API Endpoint URL | — | Endpoint for URL list requests and brand lookups |
| Site Base URL | — | Prepended to path keys from the URL list API |
| Method | POST | HTTP method for URL list requests (GET or POST) |
| Request 1 payload | `{}` | JSON body or query params for the first URL list request |
| Request 2 payload | `{}` | JSON body or query params for the second request (optional) |
| Enable Request 2 | on | Toggle the second URL list request |
| Custom headers | none | Additional HTTP headers sent with all API requests |
| Google Sheet ID | — | ID from the Sheets URL |
| Sheet tab name | Sheet1 | The tab the extension reads/writes |
| Auto-sync after scan | on | Automatically push results to Sheets after each full scan |
| Schedule enabled | off | Enable background scheduled scanning |
| Schedule interval | 24h | How often the scheduled scan runs |
| Preferred time of day | — | Optional clock time for the scheduled scan (24h format) |
| Run only when idle | on | Wait for 2 min of inactivity before a scheduled scan starts |
| Concurrency | 50 | Simultaneous URL checks (presets: Safe=10, Fast=50, Max=150) |
| Timeout | 10s | Per-URL timeout before marking as Timeout |
| Staleness threshold | 4h | Results older than this are marked Stale |

---

## Building a release ZIP

```bash
npm run build
npm run zip
```

Produces `extension.zip` in the project root, ready to upload to the Chrome Web Store or distribute internally.
