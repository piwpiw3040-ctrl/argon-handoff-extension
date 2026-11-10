# 🚀 Argon Cross-Channel Handoff & Quota Extension

> **Zero-Build Chromium Manifest V3 Extension for Multi-Channel Gemini 4 Argon Workflow, Automated Markdown Handoffs, and AI Studio Billing Guard.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests Passing](https://img.shields.io/badge/tests-27%2F27%20passed-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zero Build](https://img.shields.io/badge/build-Zero--Build%20ES%20Modules-success.svg)]()
[![Design](https://img.shields.io/badge/Design-Apple%20iOS%20Liquid%20Glass-black.svg)]()

---

## 🌟 Overview

The **Argon Cross-Channel Handoff & Quota Extension** is an open-source productivity companion designed for developers and researchers utilizing **Gemini 4 Argon** across three primary operational channels under Google AI Pro subscriptions:

1. **Channel 1 — Gemini Web (`gemini.google.com`):** Direct interactive chat & general queries.
2. **Channel 2 — Google AI Studio Playground (`aistudio.google.com`):** Deep reasoning & zero-rate-limit playground sessions.
3. **Channel 3 — Antigravity IDE / Agent Workspace:** Structured local project continuation via `.md` files.

---

## ✨ Key Features

### 1. Dual-Mode Markdown Handoff
* **Mode A — Structured Prompt Handoff (`Prompt Handoff`):**
  Automatically injects a standardized prompt requesting the AI model to generate a clean, modular handoff summary covering:
  - `## Objective`
  - `## Current State & Key Decisions`
  - `## Files & Code Context`
  - `## Open Issues & Constraints`
  - `## Next Immediate Action`
* **Mode B — DOM Snapshot Handoff (`DOM Snapshot .md`):**
  Extracts user queries and model responses directly from the active web DOM, wraps them into formatted Markdown transcripts (preserving code blocks and language tags), and prepares them for immediate cross-channel transfer.

### 2. 🛡️ AI Studio Billing Guard (Zero Pay-As-You-Go Surprises)
* **Automatic Badge Detection:** Checks for the presence of the verified `[PRO]` tier badge in the Google AI Studio navigation and footer.
* **Billing Risk Interceptor:** Scans for warning signs of Google Cloud Billing, pay-as-you-go pricing banners, or required billing account setups.
* **Safety Confirmation Gate:** Blocks automatic injection if no PRO badge is verified or if a billing risk is flagged, requiring deliberate manual confirmation (`Confirm Inject Anyway`) to prevent unexpected cloud API charges.

### 3. Multi-Account Quota State Tracking
* **Account Isolation:** Separates quota cooldowns and history across multiple Google accounts (`userA@gmail.com` vs `userB@gmail.com`).
* **Rolling History Buffer:** Maintains a 15-item FIFO ring buffer of recent handoffs stored locally in `chrome.storage.local`.
* **5-Minute Pending TTL:** Automatically invalidates stale handoff drafts to prevent accidental overwrites.

### 4. 💎 Apple iOS Luxury Dark Glassmorphism Interface
* **VisionOS Dynamic Island Floating Pill:** Compact, draggable (`⠿`), minimizable (`─`) floating capsule anchored above web composers without blocking Run/Send buttons.
* **Side Panel Hub:** Obsidian OLED dark surface (`#07080b`), translucent frosted glass cards (`backdrop-filter: blur(28px)`), hairline specular highlights, and tactile spring micro-interactions.

---

## 🔒 Privacy & Security Architecture

* **Zero Data Exfiltration:** The extension operates entirely within the user's browser. **No telemetry, analytics, or external API calls (`fetch`) are made to any third-party servers.**
* **Local Storage Only:** All quota states, account emails, and handoff history reside securely inside the browser's sandboxed `chrome.storage.local`.
* **Least-Privilege Scoping:** Permissions are strictly confined to `sidePanel`, `storage`, `downloads`, `alarms`, `tabs`, and `host_permissions` matching only `https://gemini.google.com/*` and `https://aistudio.google.com/*`.

---

## 📦 Installation & Setup

No build steps, compilers, or `npm` dependencies are required. This is a 100% native ES2022 module extension.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/piwpiw3040-ctrl/argon-handoff-extension.git
   ```
2. **Open Extensions settings** in your Chromium browser:
   * Microsoft Edge: `edge://extensions`
   * Google Chrome: `chrome://extensions`
   * Brave: `brave://extensions`
3. Enable **Developer mode** (toggle in the sidebar or top right).
4. Click **Load unpacked** (โหลดส่วนขยายที่คลายการบีบอัดแล้ว).
5. Select the `argon-handoff-extension/` directory.
6. Open [Gemini Web](https://gemini.google.com/) or [Google AI Studio](https://aistudio.google.com/) to begin!

---

## 🧪 Automated Testing

The project includes an in-browser headless test harness executing 8 test suites and 27 unit & fixture assertions:

```bash
# Run headless browser test suite (requires Python 3.10+ and Edge/Chrome)
python tests/run_tests.py
```

Expected output:
```text
✔ [constants] pins spec invariants and freezes configuration objects
✔ [handoff-builder] sanitizes slugs with Thai/Unicode, forbidden Windows chars, and reserved names
✔ [billing-guard] allows auto-inject only when PRO badge is present and no billing risk is detected
✔ [adapter-fixtures] gemini-normal: detects email, Argon model, extracts reply/turns, and injects prompt
✔ [adapter-fixtures] aistudio-pro: detects PRO badge and injects systemInstructions and prompt
✔ [background-router] serializes concurrent CONSUME_PENDING_HANDOFF so only the first caller succeeds
✔ [sidepanel-controller] renders multi-account matrix, billing risk banner, and draft editor
...
Summary: 27 passed, 0 failed
```

---

## ⚖️ Disclaimers & Legal Notice

### 1. Trademark Disclaimer
This project is an **independent, open-source community tool** and is **NOT affiliated with, sponsored by, authorized by, or endorsed by Google LLC or Alphabet Inc.** 
* "Google", "Gemini", "Google AI Studio", and their respective logos are registered trademarks of Google LLC.

### 2. Financial & Billing Disclaimer
Google AI Studio offers both free playground tiers and paid pay-as-you-go Google Cloud API billing tiers. While this extension provides an automated **Billing Guard** to assist users in identifying tier badges and warnings:
* **The developers of this project assume NO liability or responsibility for any charges, fees, subscriptions, or unexpected billing incurred on your Google or Google Cloud accounts.**
* Users are solely responsible for managing their own account permissions, billing settings, and tool configurations (such as Search Grounding or URL Context).

### 3. "AS IS" Limitation of Liability
THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
