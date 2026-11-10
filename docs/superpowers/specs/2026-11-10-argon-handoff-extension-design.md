# Design Spec: Argon Cross-Channel Handoff & Quota Extension (Sub-project 1)

**Date:** 2026-11-10  
**Status:** Draft (Pending User Review Gate)  
**Target Workspace:** `argon-handoff-extension/`  
**Scope:** Sub-project 1 — Browser-side Chromium Manifest V3 Extension (Zero-Build ES Modules) covering Channel 1 (`gemini.google.com`) and Channel 2 (`aistudio.google.com`), plus `.md` export/prompt handoff to Channel 3 (Antigravity). Local Antigravity RPC bridge is explicitly deferred to Sub-project 2 via an isolated extension hook.

---

## 1. Purpose, Users & Success Criteria

### 1.1 Intended Outcome
Enable a solo Windows developer on **Google AI Pro** to transition seamlessly across Gemini 4 Argon channels when rolling hourly/burst quotas exhaust:
1. **Channel 1 → Channel 2:** Capture work from Gemini Web (either proactively via Handoff Prompt or post-lockout via DOM Snapshot) and deliver it cleanly into Google AI Studio Playground with Billing Guard checks and checklist reminders (`PRO` badge, `Thinking = High`, `Google Search Grounding`).
2. **Channel 1 / 2 → Channel 3:** Export a clean `.md` Handoff file to Windows Downloads and copy a ready-to-paste continuation prompt for Antigravity.
3. **Multi-Account Visibility:** Track per-account channel status and cooldown timers without leaving the active browser workflow.

### 1.2 Environment Constraints & YAGNI Decisions
- **Runtime:** Host Windows environment has `Python 3.12.10` and Chromium browsers (Brave / Microsoft Edge confirmed on host; compatible with Chrome/Edge/Brave Manifest V3), with **no Node.js / npm**. Therefore, the extension uses **Zero-Build Manifest V3 Native ES Modules** (plain JS/HTML/CSS, loadable directly via *Load unpacked*).
- **Non-Goals (YAGNI for V1):**
  - No automatic clicking of Google AI Studio model/thinking/grounding dropdowns (high DOM fragility and billing-misclick risk); replaced by prefilled prompt/System Instructions + interactive pre-run checklist.
  - No direct `window.showDirectoryPicker()` dependency inside the Side Panel (known Chromium gesture/context pitfalls); uses reliable `chrome.downloads` to `Downloads/argon-handoffs/` + Clipboard API.
  - No direct Antigravity `language_server.exe` RPC calls from the browser in V1 (deferred to Sub-project 2 via `ChannelProvider` hook).

---

## 2. System Architecture & Component Boundaries

```text
+---------------------------+        +---------------------------+
| https://gemini.google.com |        | https://aistudio.google.com|
|  - content-loader.js      |        |  - content-loader.js      |
|  - gemini-adapter.js      |        |  - aistudio-adapter.js    |
|  - floating-pill.js       |        |  - floating-pill.js       |
+-------------+-------------+        +-------------+-------------+
              |     chrome.runtime.sendMessage     |
              +-----------------+------------------+
                                v
               +----------------+----------------+
               |     background.js (SW Module)   |
               |  - Cross-tab Handoff Router     |
               |  - Cooldown Alarms              |
               |  - chrome.downloads (.md)       |
               |  - ChannelProvider Hook (Ph. 2) |
               +----------------+----------------+
                                ^
                                | Storage & Runtime RPC
               +----------------+----------------+
               |   sidepanel/ (ES Module UI)     |
               |  - Account & Channel Matrix     |
               |  - Billing Guard Banner         |
               |  - .md Handoff Workbench        |
               +----------------+----------------+
                                |
                                v
               +---------------------------------+
               | shared/ (Pure JS Domain Logic)  |
               |  - handoff-builder.js           |
               |  - quota-model.js               |
               |  - billing-guard.js             |
               |  - channel-provider.js          |
               +---------------------------------+
```

### 2.1 File Layout
```text
argon-handoff-extension/
├── manifest.json
├── background.js
├── shared/
│   ├── constants.js          # Message types, TTLs, channel IDs, storage keys
│   ├── handoff-builder.js    # Prompt templates, DOM-to-Markdown formatter, Antigravity export prompt
│   ├── quota-model.js        # Per-account state transitions, cooldown math, history ring-buffer
│   ├── billing-guard.js      # Pure evaluation rules for AI Studio PRO / billing risk alerts
│   └── channel-provider.js   # Phase-2 extension interface for Channel 3 (Antigravity local bridge)
├── content/
│   ├── content-loader.js     # Classic MV3 content script shim doing dynamic import()
│   ├── adapter-contract.js   # Shared JSDoc/runtime validator & resilient selector helpers
│   ├── gemini-adapter.js     # gemini.google.com adapter
│   ├── aistudio-adapter.js   # aistudio.google.com adapter
│   └── floating-pill.js      # Shadow DOM floating widget (trigger handoff + status badge)
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
└── tests/
    ├── run_tests.py          # Zero-dep Python CLI runner (serves repo + runs headless Edge callback)
    ├── runner.html           # Browser ES-module test runner (interactive & headless POST callback)
    ├── test-harness.js       # Lightweight assert / suite runner with DOM, console & POST summary
    ├── unit/
    │   ├── handoff-builder.test.js
    │   ├── quota-model.test.js
    │   ├── billing-guard.test.js
    │   └── channel-provider.test.js
    └── fixtures/
        ├── adapter-fixtures.test.js
        ├── gemini-normal.html
        ├── gemini-flashlite-locked.html
        ├── aistudio-pro.html
        └── aistudio-billing-risk.html
```

### 2.2 Manifest V3 Configuration (`manifest.json`)
- `"manifest_version": 3`
- `"permissions"`: `["sidePanel", "storage", "downloads", "alarms", "tabs"]`
- `"host_permissions"`: `["https://gemini.google.com/*", "https://aistudio.google.com/*"]`
- `"background"`: `{ "service_worker": "background.js", "type": "module" }`
- `"side_panel"`: `{ "default_path": "sidepanel/sidepanel.html" }`
- `"content_scripts"`:
  - `content/content-loader.js` matched on `https://gemini.google.com/*` and `https://aistudio.google.com/*`
- `"web_accessible_resources"`:
  - Expose `content/*.js` and `shared/*.js` **only** to `["https://gemini.google.com/*", "https://aistudio.google.com/*"]` so `content-loader.js` can dynamically `import(chrome.runtime.getURL(...))` inside the Isolated World.

### 2.3 Unit Boundaries & Contracts
1. **`shared/` (Pure Domain Layer):** Zero `chrome.*` and zero DOM dependencies. All functions take plain inputs and return deterministic outputs so they can be unit-tested identically in browser tests.
2. **`content/adapter-contract.js` + Site Adapters:**
   Every site adapter exports:
   - `channelId`: `'gemini_web' | 'ai_studio'`
   - `detectAccountEmail(doc)` → `string | null`
   - `inspectStatus(doc)` → `{ modelLabel: string | null, isFlashLiteFallback: boolean, isRateLimited: boolean, proBadgePresent: boolean, billingRiskDetected: boolean, signals: string[] }`
   - `extractLatestReply(doc)` → `{ ok: boolean, markdown?: string, reason?: string }`
   - `extractConversation(doc, maxTurns)` → `{ ok: boolean, turns?: Array<{ role: 'user' | 'assistant', content: string }>, reason?: string }`
   - `injectText(doc, payload)` → `Promise<{ ok: boolean, injectedFields: string[], reason?: string }>` (`payload = { prompt, systemInstructions?, autoSend?: boolean }`)
3. **`background.js` (Coordinator):**
   - Sets `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
   - Routes runtime messages (`CAPTURE_HANDOFF`, `INJECT_HANDOFF_PROMPT`, `PREPARE_AISTUDIO_HANDOFF`, `EXPORT_ANTIGRAVITY_MD`, `UPDATE_CHANNEL_STATUS`, `REPORT_PAGE_STATUS`, `CONSUME_PENDING_HANDOFF`).
   - Schedules `chrome.alarms` for `resetAt` timestamps to reset `'cooldown'` → `'ready'`.
   - Implements `ChannelProvider` default stub for `antigravity` (`status: 'unknown'`, `phase2Hook: true`).
4. **`sidepanel/` (UI Workbench):**
   - Renders Account/Channel Matrix, Billing Guard warning banner, editable `.md` Handoff preview, AI Studio pre-run checklist (`PRO Badge`, `Thinking = High`, `Google Search Grounding`), and Handoff History drawer (last 15 items).

---

## 3. Data Flow & State Schema

### 3.1 Dual-Mode Handoff Pipeline
1. **Mode A — Live AI Summary (Quota Available):**
   - User clicks `Prompt Handoff` in Floating Pill or Side Panel.
   - Active adapter injects `HANDOFF_SUMMARY_PROMPT` (customizable template asking the model for a structured Markdown block with `Objective`, `Current State & Decisions`, `Files / Code Context`, `Open Bugs / Constraints`, `Exact Next Action`).
   - Optional toggle `autoSend` (default `false` for safety; user reviews or clicks send).
   - Once model responds, user clicks `Capture Reply` → adapter extracts latest assistant message markdown → stored in `handoffDraft` + pushed to `handoffHistory`.
2. **Mode B — Instant DOM Snapshot (Rate-Limited / Flash-Lite Fallback):**
   - User clicks `DOM Snapshot (.md)` (zero extra tokens spent).
   - Active adapter extracts up to last `N` visible turns (default `N = 12`, configurable) preserving fenced code blocks.
   - `handoff-builder.js` formats transcript into structured Handoff Markdown with header metadata (`sourceChannel`, `accountEmail`, `capturedAt`, `modelStatus`, `snapshotMode: 'dom_fallback'`) → stored in `handoffDraft` + `handoffHistory`.

### 3.2 Smart Delivery Flows
- **To Channel 2 (`aistudio.google.com`):**
  1. User clicks `Send to AI Studio` in Side Panel.
  2. `background.js` stores `pendingHandoff` with `expiresAt = now + 5 * 60 * 1000` (5-minute TTL) and opens `https://aistudio.google.com/prompts/new_chat`.
  3. On load, `aistudio-adapter.js` waits for composer readiness via `MutationObserver` (15s timeout), requests `CONSUME_PENDING_HANDOFF` (which atomically reads and clears `pendingHandoff` from `chrome.storage.local` while holding the payload in that tab's local memory), and runs `billing-guard.js` against `inspectStatus(document)`:
     - If `proBadgePresent === true` and `!billingRiskDetected`: injects `systemInstructions` (if field located) and `prompt` markdown into the Playground prompt composer **without auto-running**.
     - If Billing Guard flags risk (`!proBadgePresent` or `billingRiskDetected`): **pauses auto-injection**, shows red warning banner in Floating Pill & Side Panel, and keeps the in-memory payload available behind explicit user action (`Confirm Inject Anyway` or `Copy to Clipboard`).
  4. Because `pendingHandoff` is cleared atomically upon `CONSUME_PENDING_HANDOFF`, refreshing or opening another AI Studio tab later will never replay an old handoff.
- **To Channel 3 (`Antigravity`):**
  1. User clicks `Export for Antigravity`.
  2. `background.js` validates filename slug and invokes `chrome.downloads.download` using a `data:text/markdown;charset=utf-8,...` URL to `argon-handoffs/handoff-YYYYMMDD-HHmm-<slug>.md` (`conflictAction: 'uniquify'`).
  3. Side Panel writes a concise continuation prompt referencing the downloaded `.md` filename into `navigator.clipboard` and shows confirmation toast.

### 3.3 `chrome.storage.local` Schema
```json
{
  "schemaVersion": 1,
  "activeEmail": "user@gmail.com",
  "settings": {
    "autoSendHandoffPrompt": false,
    "snapshotMaxTurns": 12,
    "defaultCooldownMinutes": 60,
    "customHandoffPrompt": null
  },
  "accounts": {
    "user@gmail.com": {
      "updatedAt": 1794319200000,
      "channels": {
        "gemini_web": {
          "status": "ready",
          "resetAt": null,
          "source": "auto",
          "lastSignal": null
        },
        "ai_studio": {
          "status": "ready",
          "proBadgeSeen": true,
          "billingRisk": false,
          "resetAt": null,
          "source": "auto",
          "lastCheckedAt": 1794319200000
        },
        "antigravity": {
          "status": "unknown",
          "phase2Hook": true,
          "note": "Track manually until Phase 2 Local Bridge"
        }
      }
    }
  },
  "pendingHandoff": null,
  "handoffDraft": {
    "id": "uuid",
    "sourceChannel": "gemini_web",
    "accountEmail": "user@gmail.com",
    "mode": "dom_snapshot",
    "titleSlug": "auth-refactor",
    "systemInstructions": "",
    "markdown": "",
    "createdAt": 1794319200000
  },
  "handoffHistory": []
}
```
- **Invariants:**
  - `handoffHistory` capped at maximum **15** items (FIFO eviction).
  - Fallback key `'default-profile'` used when `detectAccountEmail()` returns `null`; user can assign/merge email manually in Side Panel.
  - Allowed channel status values:
    - `gemini_web`: `'ready' | 'degraded_flash_lite' | 'cooldown'`
    - `ai_studio`: `'ready' | 'cooldown' | 'billing_risk'`
    - `antigravity`: `'unknown' | 'ready' | 'cooldown'`

---

## 4. Error Handling & Resilience

| Failure Mode | Detection | Recovery / Fallback Behavior |
| :--- | :--- | :--- |
| **Google DOM selector drift** (cannot find chat turns or composer) | Multi-tier semantic selector lookup returns `null` | Adapter returns `{ ok: false, reason: 'SELECTOR_NOT_FOUND' }`. Capture falls back to `window.getSelection()` or manual paste box in Side Panel; AI Studio injection falls back to Clipboard copy + toast notification (`Ctrl+V` ready). |
| **AI Studio SPA slow mount** | Composer missing on `DOMContentLoaded` | `MutationObserver` watches `document.body` up to `15000 ms`; on timeout returns `'COMPOSER_TIMEOUT'` and falls back to Clipboard copy + clears `pendingHandoff`. |
| **Expired / stale `pendingHandoff`** | `Date.now() > pendingHandoff.expiresAt` | Background discards stale payload on `CONSUME_PENDING_HANDOFF` and returns `{ ok: false, reason: 'EXPIRED' }` so old handoffs never hijack new tabs. |
| **AI Studio Billing Risk** (`PRO` badge absent, free-tier/API-key billing prompt visible) | `billing-guard.js` evaluates `inspectStatus()` signals | Auto-injection blocked behind explicit confirmation gate; red Billing Guard banner shown in both Pill and Side Panel; account channel marked `'billing_risk'`. |
| **Account email undetectable** | `detectAccountEmail()` returns `null` | Fall back to `'default-profile'` without blocking Handoff; Side Panel displays quick email selector/input. |
| **Clipboard API permission error** (unfocused document) | `navigator.clipboard.writeText()` throws | Side Panel shows selectable `<textarea>` fallback + one-click `Select All` button so user never loses generated `.md`. |
| **Storage quota or corrupted JSON** | Schema guard on read | Validate `schemaVersion === 1`; sanitize missing sub-objects via `quota-model.js` normalizer (`normalizeState()`). |

---

## 5. Comprehensive Testing Specification

All tests must run **without Node.js/npm** using native browser ES Modules (`tests/runner.html`) over a local Python HTTP server (`python -m http.server`) — verifiable interactively in Chrome/Edge/Brave or headlessly via Edge (`msedge.exe --headless --dump-dom`).

### 5.1 Unit Tests (`tests/unit/`)
1. **`handoff-builder.test.js`:**
   - Formats DOM turns into deterministic Markdown preserving fenced code blocks, metadata header, and empty-turn error handling.
   - Sanitizes filename slugs (strips special Windows path chars `<>:"/\|?*`, spaces → `-`, fallback slug `'session'`, enforces max length).
   - Generates valid Antigravity continuation prompt referencing exact exported filename.
   - Validates customizable prompt template substitution (default template vs user override).
2. **`quota-model.test.js`:**
   - Initializes and normalizes corrupted/partial storage payloads safely (`normalizeState()`).
   - Transitions channel statuses (`ready` → `degraded_flash_lite` / `cooldown` → `ready` on `resetAt` expiry).
   - Evaluates multi-account isolation (`userA@gmail.com` cooldown never mutates `userB@gmail.com`).
   - Enforces `handoffHistory` ring buffer cap at exactly 15 items (newest retained, oldest evicted).
   - Validates `pendingHandoff` 5-minute TTL expiration (`isPendingHandoffValid()`).
3. **`billing-guard.test.js`:**
   - Allows auto-inject when `proBadgePresent === true && billingRiskDetected === false`.
   - Blocks auto-inject (`action: 'HOLD_AND_WARN'`) when `proBadgePresent === false` (even if no explicit billing text appears).
   - Blocks auto-inject when `billingRiskDetected === true` (e.g., Pay-as-you-go / Cloud Billing / API key warnings).
   - Returns structured reason codes (`NO_PRO_BADGE`, `BILLING_PROMPT_DETECTED`, `SAFE_PRO_PLAYGROUND`).
4. **`channel-provider.test.js`:**
   - Verifies the default `AntigravityStubProvider` returns `{ status: 'unknown', phase2Hook: true }` without throwing or performing network calls.
   - Verifies custom provider registration replaces the default stub cleanly for Phase 2 extension.

### 5.2 Adapter & DOM Fixture Tests (`tests/fixtures/`)
Using isolated `DOMParser` HTML fixtures (no network calls, no live quota spent):
1. **`gemini-normal.html`:** Extracts account email, identifies active model without false `isFlashLiteFallback` / `isRateLimited`, extracts multi-turn conversation including multi-line code blocks, injects Handoff prompt into composer.
2. **`gemini-flashlite-locked.html`:** Detects Flash-Lite downgrade / limit banner (`isFlashLiteFallback === true` or `isRateLimited === true`) and still succeeds on `extractConversation()` DOM Snapshot.
3. **`aistudio-pro.html`:** Detects `PRO` badge (`proBadgePresent === true`), separates `System Instructions` and prompt input slots, injects both cleanly without clicking Run.
4. **`aistudio-billing-risk.html`:** Detects missing `PRO` badge or Cloud Billing warning text (`billingRiskDetected === true`), verifies `billing-guard.js` prevents injection.
5. **Broken Selector Fixture (inline empty DOM):** Verifies all adapter methods return structured `{ ok: false, reason: 'SELECTOR_NOT_FOUND' }` without throwing uncaught exceptions.

### 5.3 Live Chromium Extension Verification Checklist (Manual / E2E Smoke)
1. Load unpacked `argon-handoff-extension/` in Chromium (`chrome://extensions` / `edge://extensions`) with zero manifest or service worker errors.
2. On `gemini.google.com`: verify Floating Pill mounts in Shadow DOM, `Prompt Handoff` injects template without auto-sending, `Capture Reply` & `DOM Snapshot (.md)` populate Side Panel Workbench.
3. Click `Send to AI Studio`: verify `aistudio.google.com/prompts/new_chat` opens, Billing Guard evaluates `PRO` badge, `.md` populates composer, and refreshing the tab does **not** re-inject stale `pendingHandoff`.
4. Click `Export for Antigravity`: verify `.md` saves under `Downloads/argon-handoffs/` and Clipboard contains the exact continuation prompt.
5. Mark account cooldown (e.g., 1 min test override or standard 60m) and verify `chrome.alarms` restores status to `'ready'` automatically.
