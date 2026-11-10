# Argon Cross-Channel Handoff & Quota Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-build Chromium Manifest V3 extension that manages multi-account Gemini 4 Argon quota states, enforces an AI Studio Billing Guard, and automates Dual-Mode `.md` Handoffs across Gemini Web (`gemini.google.com`), Google AI Studio (`aistudio.google.com`), and Antigravity.

**Architecture:** Isolated pure ES modules in `shared/` hold all markdown formatting, quota state transitions, and Billing Guard evaluation with zero browser-API coupling. Site-specific DOM scraping and prompt injection live in isolated adapters (`content/gemini-adapter.js`, `content/aistudio-adapter.js`) loaded via dynamic `import()` from `content/content-loader.js`, coordinated across tabs by `background.js` and controlled from a persistent Side Panel (`sidepanel/`).

**Tech Stack:** Chromium Manifest V3, Native ES2022 Modules (Zero-Build JS/HTML/CSS), Shadow DOM, Python 3.12 (`http.server` + headless Microsoft Edge CLI test runner).

**Spec:** `docs/superpowers/specs/2026-11-10-argon-handoff-extension-design.md`

## Global Constraints

- Zero-Build Chromium Manifest V3 Native ES Modules only (no Node.js, npm, or bundler required).
- `permissions` in `manifest.json` must be strictly `["sidePanel", "storage", "downloads", "alarms", "tabs"]`.
- `host_permissions` and `web_accessible_resources.matches` must be strictly `["https://gemini.google.com/*", "https://aistudio.google.com/*"]`.
- Modules inside `shared/` must have zero `chrome.*` and zero global DOM (`window`/`document`) dependencies.
- `handoffHistory` ring buffer maximum length is `15` (FIFO eviction).
- `pendingHandoff` TTL is `5 * 60 * 1000` ms (`300000` ms); AI Studio composer `MutationObserver` timeout is `15000` ms.
- Antigravity exports save to `argon-handoffs/handoff-YYYYMMDD-HHmm-<slug>.md` with `conflictAction: 'uniquify'`.
- All unit and DOM fixture tests run via `python tests/run_tests.py` using Python's built-in HTTP server and headless Microsoft Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).

## Review Focus

1. **Nested triple-backtick code fences inside chat turns (` ```markdown ` or ` ```js `):** `formatDomTranscript` and `buildHandoffMarkdown` in `shared/handoff-builder.js` must preserve inner fenced code blocks verbatim without premature fence closure or truncation (tested in Task 2).
2. **Thai / Unicode titles and Windows reserved filenames (`CON`, `NUL`, or punctuation-only strings) in `sanitizeSlug`:** Stripping non-ASCII characters naively produces empty slugs on Thai titles; `sanitizeSlug` must preserve Thai/alphanumeric characters, strip Windows-forbidden path characters `<>:"/\|?*`, reject reserved DOS names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`), cap at 40 chars, and fall back to `'session'` (tested in Task 2).
3. **Malformed or non-numeric timestamps (`NaN`, negative numbers, non-finite strings) in `resetAt` or `expiresAt`:** `normalizeState`, `refreshExpiredCooldowns`, and `isPendingHandoffValid` in `shared/quota-model.js` must coerce invalid timestamps to `null` / expired rather than wedging a channel in permanent `'cooldown'` (tested in Task 3).
4. **False-positive `"PRO"` text inside user chat messages on AI Studio:** `aistudioAdapter.inspectStatus(doc)` must only check designated header/tier badge containers for `proBadgePresent` and must still flag `billingRiskDetected: true` when Cloud Billing / Pay-as-you-go / API-key pricing prompts appear in status banners (tested in Task 5).
5. **Concurrent `CONSUME_PENDING_HANDOFF` requests from two AI Studio tabs opened simultaneously:** `background.js` must guard consumption with an in-memory mutex/atomic read-and-clear so only the first caller gets `{ ok: true, handoff }` and the second gets `{ ok: false, reason: 'EMPTY' }` (tested in Task 6).

---

### Task 1: Headless Browser Test Harness & Shared Constants

**Files:**
- Create: `shared/constants.js`
- Create: `tests/test-harness.js`
- Create: `tests/runner.html`
- Create: `tests/run_tests.py`
- Create: `tests/unit/constants.test.js`

**Interfaces:**
- Consumes: none
- Produces:
  - `shared/constants.js`:
    - `SCHEMA_VERSION = 1`
    - `DEFAULT_ACCOUNT_KEY = 'default-profile'`
    - `MAX_HISTORY_ITEMS = 15`
    - `PENDING_HANDOFF_TTL_MS = 300000`
    - `COMPOSER_TIMEOUT_MS = 15000`
    - `DEFAULT_SETTINGS = Object.freeze({ autoSendHandoffPrompt: false, snapshotMaxTurns: 12, defaultCooldownMinutes: 60, customHandoffPrompt: null })`
    - `CHANNELS = Object.freeze({ GEMINI_WEB: 'gemini_web', AI_STUDIO: 'ai_studio', ANTIGRAVITY: 'antigravity' })`
    - `CHANNEL_STATUS = Object.freeze({ READY: 'ready', COOLDOWN: 'cooldown', DEGRADED_FLASH_LITE: 'degraded_flash_lite', BILLING_RISK: 'billing_risk', UNKNOWN: 'unknown' })`
    - `MESSAGE_TYPES = Object.freeze({ CAPTURE_HANDOFF: 'CAPTURE_HANDOFF', INJECT_HANDOFF_PROMPT: 'INJECT_HANDOFF_PROMPT', PREPARE_AISTUDIO_HANDOFF: 'PREPARE_AISTUDIO_HANDOFF', EXPORT_ANTIGRAVITY_MD: 'EXPORT_ANTIGRAVITY_MD', UPDATE_CHANNEL_STATUS: 'UPDATE_CHANNEL_STATUS', REPORT_PAGE_STATUS: 'REPORT_PAGE_STATUS', CONSUME_PENDING_HANDOFF: 'CONSUME_PENDING_HANDOFF', OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL' })`
  - `tests/test-harness.js`:
    - `describe(suiteName, fn)`
    - `it(testName, fn)` (supports sync and async `fn`)
    - `assert(condition, message)`
    - `assertEqual(actual, expected, message)`
    - `assertDeepEqual(actual, expected, message)`
    - `runAllSuites(filterSubstring)` -> `Promise<{ passed: number, failed: number, results: Array<{ suite: string, name: string, ok: boolean, error?: string }> }>`

- [ ] **Step 1: Write the failing test and test runner (`tests/run_tests.py`, `tests/runner.html`, `tests/test-harness.js`, `tests/unit/constants.test.js`)**

Create `tests/unit/constants.test.js`:
```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import {
  SCHEMA_VERSION,
  DEFAULT_ACCOUNT_KEY,
  MAX_HISTORY_ITEMS,
  PENDING_HANDOFF_TTL_MS,
  COMPOSER_TIMEOUT_MS,
  DEFAULT_SETTINGS,
  CHANNELS,
  CHANNEL_STATUS,
  MESSAGE_TYPES
} from '../../shared/constants.js';

describe('constants', () => {
  it('pins spec invariants and freezes configuration objects', () => {
    assertEqual(SCHEMA_VERSION, 1);
    assertEqual(DEFAULT_ACCOUNT_KEY, 'default-profile');
    assertEqual(MAX_HISTORY_ITEMS, 15);
    assertEqual(PENDING_HANDOFF_TTL_MS, 300000);
    assertEqual(COMPOSER_TIMEOUT_MS, 15000);
    assertEqual(DEFAULT_SETTINGS.snapshotMaxTurns, 12);
    assertEqual(DEFAULT_SETTINGS.autoSendHandoffPrompt, false);
    assertEqual(CHANNELS.GEMINI_WEB, 'gemini_web');
    assertEqual(CHANNELS.AI_STUDIO, 'ai_studio');
    assertEqual(CHANNELS.ANTIGRAVITY, 'antigravity');
    assert(Object.isFrozen(DEFAULT_SETTINGS), 'DEFAULT_SETTINGS must be frozen');
    assert(Object.isFrozen(CHANNEL_STATUS), 'CHANNEL_STATUS must be frozen');
    assert(Object.isFrozen(MESSAGE_TYPES), 'MESSAGE_TYPES must be frozen');
  });
});
```

In `tests/run_tests.py`, serve the `argon-handoff-extension` root over `http.server.HTTPServer(('127.0.0.1', 0), Handler)`, accept `--suite <filter>`, launch `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` with `--headless=new --disable-gpu --no-first-run --user-data-dir=<tempdir>` pointing to `http://127.0.0.1:<port>/tests/runner.html?suite=<filter>`, wait for `POST /__report__` JSON payload `{ passed, failed, results }`, print each test line, clean up `<tempdir>`, and exit `0` if `failed == 0 and passed > 0` else `1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite constants`
Expected: FAIL (missing `shared/constants.js` module load error reported by `runner.html`).

- [ ] **Step 3: Implement `shared/constants.js`**

Export all frozen constants matching the exact names and values in the `Produces` block above.

- [ ] **Step 4: Run test to verify it passes**

Run: `python argon-handoff-extension/tests/run_tests.py --suite constants`
Expected: PASS (`1 passed, 0 failed`)

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add shared/constants.js tests/
git -C argon-handoff-extension commit -m "test: add headless Edge ES module test runner and shared constants"
```

---

### Task 2: Handoff Markdown Builder & Slug/Prompt Formatter

**Files:**
- Create: `shared/handoff-builder.js`
- Create: `tests/unit/handoff-builder.test.js`
- Modify: `tests/runner.html` (register `handoff-builder.test.js`)

**Interfaces:**
- Consumes: `CHANNELS`, `DEFAULT_SETTINGS` from `shared/constants.js`
- Produces (`shared/handoff-builder.js`):
  - ` DEFAULT_HANDOFF_PROMPT`: `string` (structured prompt requesting `## Objective`, `## Current State & Key Decisions`, `## Files & Code Context`, `## Open Issues / Constraints`, `## Next Immediate Action`)
  - `getHandoffSummaryPrompt(customPrompt?: string | null) -> string`
  - `sanitizeSlug(rawTitle?: string | null) -> string`
  - `formatTimestampCompact(epochMs: number) -> string` (returns local `YYYYMMDD-HHmm`)
  - `formatDomTranscript(turns: Array<{ role: 'user' | 'assistant', content: string }>, maxTurns?: number) -> { ok: boolean, markdown?: string, reason?: string }`
  - `buildHandoffMarkdown(params: { sourceChannel: string, accountEmail: string, mode: 'prompt_reply' | 'dom_snapshot', title?: string, bodyMarkdown: string, modelStatus?: string, capturedAt?: number }) -> string`
  - `buildAntigravityExport(params: { markdown: string, title?: string, capturedAt?: number }) -> { filePath: string, fileName: string, continuationPrompt: string }`

- [ ] **Step 1: Write the failing test (`tests/unit/handoff-builder.test.js`)**

```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import {
  getHandoffSummaryPrompt,
  sanitizeSlug,
  formatDomTranscript,
  buildHandoffMarkdown,
  buildAntigravityExport
} from '../../shared/handoff-builder.js';

describe('handoff-builder', () => {
  it('sanitizes slugs with Thai/Unicode, forbidden Windows chars, and reserved names', () => {
    assertEqual(sanitizeSlug('Auth Refactor: Step 1/2?'), 'auth-refactor-step-1-2');
    assertEqual(sanitizeSlug('แก้บั๊ก โควต้า <Argon>'), 'แก้บั๊ก-โควต้า-argon');
    assertEqual(sanitizeSlug('CON'), 'session');
    assertEqual(sanitizeSlug('   ***   '), 'session');
    assertEqual(sanitizeSlug('a'.repeat(60)).length, 40);
  });

  it('preserves nested triple-backtick code blocks in formatDomTranscript', () => {
    const turns = [
      { role: 'user', content: 'Fix this snippet:\n```js\nconst x = 1;\n```' },
      { role: 'assistant', content: 'Updated:\n```js\nconst x = 2;\n```' }
    ];
    const res = formatDomTranscript(turns, 12);
    assertEqual(res.ok, true);
    assert(res.markdown.includes('```js\nconst x = 1;\n```'), 'must keep user code fence');
    assert(res.markdown.includes('```js\nconst x = 2;\n```'), 'must keep assistant code fence');
  });

  it('rejects empty turns array in formatDomTranscript', () => {
    const res = formatDomTranscript([], 12);
    assertEqual(res.ok, false);
    assertEqual(res.reason, 'EMPTY_TURNS');
  });

  it('builds deterministic Antigravity export path and continuation prompt', () => {
    const ts = new Date(2026, 10, 10, 21, 5, 0).getTime(); // 2026-11-10 21:05
    const md = buildHandoffMarkdown({
      sourceChannel: 'gemini_web',
      accountEmail: 'dev@gmail.com',
      mode: 'dom_snapshot',
      title: 'Auth Flow',
      bodyMarkdown: '## Objective\nShip it',
      modelStatus: 'degraded_flash_lite',
      capturedAt: ts
    });
    assert(md.includes('sourceChannel: gemini_web'), 'header metadata');
    const exp = buildAntigravityExport({ markdown: md, title: 'Auth Flow', capturedAt: ts });
    assertEqual(exp.fileName, 'handoff-20261110-2105-auth-flow.md');
    assertEqual(exp.filePath, 'argon-handoffs/handoff-20261110-2105-auth-flow.md');
    assert(exp.continuationPrompt.includes('handoff-20261110-2105-auth-flow.md'), 'prompt references filename');
  });

  it('returns custom prompt when non-empty and falls back to default otherwise', () => {
    assert(getHandoffSummaryPrompt(null).includes('## Objective'), 'default prompt');
    assertEqual(getHandoffSummaryPrompt('  Custom Summary  '), 'Custom Summary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite handoff-builder`
Expected: FAIL (`shared/handoff-builder.js` not found).

- [ ] **Step 3: Implement `shared/handoff-builder.js`**

- In `sanitizeSlug(rawTitle)`: lowercase, replace `<>:"/\\|?*` and whitespace runs with `-`, keep `/[\p{L}\p{N}-]/gu` (Unicode letters/marks/numbers so Thai characters survive: use `/[^\p{L}\p{M}\p{N}-]+/gu`), collapse multiple `-`, trim leading/trailing `-`, slice to `40` chars, and if empty or matching `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`, return `'session'`.
- In `formatDomTranscript(turns, maxTurns = 12)`: return `{ ok: false, reason: 'EMPTY_TURNS' }` if `!Array.isArray(turns) || turns.length === 0`; slice the last `maxTurns` items; render each turn under `### [Turn N — User|Assistant]` without wrapping the turn body inside outer backticks so inner ` ``` ` fences never collide.

- [ ] **Step 4: Run test to verify it passes**

Run: `python argon-handoff-extension/tests/run_tests.py --suite handoff-builder`
Expected: PASS (`5 passed, 0 failed`)

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add shared/handoff-builder.js tests/unit/handoff-builder.test.js tests/runner.html
git -C argon-handoff-extension commit -m "feat: add handoff markdown builder and slug sanitizer"
```

---

### Task 3: Multi-Account Quota Model, Ring Buffer & Phase-2 Provider Hook

**Files:**
- Create: `shared/channel-provider.js`
- Create: `shared/quota-model.js`
- Create: `tests/unit/channel-provider.test.js`
- Create: `tests/unit/quota-model.test.js`
- Modify: `tests/runner.html`

**Interfaces:**
- Consumes: `SCHEMA_VERSION`, `DEFAULT_ACCOUNT_KEY`, `MAX_HISTORY_ITEMS`, `PENDING_HANDOFF_TTL_MS`, `DEFAULT_SETTINGS`, `CHANNELS`, `CHANNEL_STATUS` from `shared/constants.js`
- Produces:
  - `shared/channel-provider.js`:
    - `createDefaultAntigravityStatus() -> { status: 'unknown', phase2Hook: true, note: string }`
    - `registerAntigravityProvider(provider: { getStatus: (email?: string) => Promise<object> } | null) -> void`
    - `queryAntigravityStatus(email?: string) -> Promise<{ status: string, phase2Hook: boolean, note?: string }>`
  - `shared/quota-model.js`:
    - `createEmptyAccountRecord(nowMs?: number) -> object`
    - `normalizeState(rawState?: any, nowMs?: number) -> object`
    - `ensureAccount(state: object, email?: string | null, nowMs?: number) -> { state: object, accountKey: string }`
    - `updateChannelStatus(state: object, params: { email?: string | null, channel: string, status: string, resetAt?: number | null, source?: 'auto' | 'manual', proBadgeSeen?: boolean, billingRisk?: boolean, lastSignal?: string | null }, nowMs?: number) -> object`
    - `refreshExpiredCooldowns(state: object, nowMs?: number) -> { state: object, expiredKeys: Array<{ email: string, channel: string }> }`
    - `appendHandoffHistory(state: object, draft: object) -> object`
    - `createPendingHandoff(params: { target?: string, markdown: string, systemPrompt?: string, sourceEmail?: string }, nowMs?: number) -> object`
    - `isPendingHandoffValid(pending: any, nowMs?: number) -> boolean`

- [ ] **Step 1: Write the failing tests (`tests/unit/channel-provider.test.js` and `tests/unit/quota-model.test.js`)**

`tests/unit/channel-provider.test.js`:
```javascript
import { describe, it, assertEqual } from '../test-harness.js';
import {
  registerAntigravityProvider,
  queryAntigravityStatus
} from '../../shared/channel-provider.js';

describe('channel-provider', () => {
  it('returns default unknown stub status when no Phase 2 provider is registered', async () => {
    registerAntigravityProvider(null);
    const res = await queryAntigravityStatus('dev@gmail.com');
    assertEqual(res.status, 'unknown');
    assertEqual(res.phase2Hook, true);
  });

  it('delegates to registered custom provider for Phase 2 extension', async () => {
    registerAntigravityProvider({
      async getStatus(email) {
        return { status: 'ready', phase2Hook: true, account: email };
      }
    });
    const res = await queryAntigravityStatus('pro@gmail.com');
    assertEqual(res.status, 'ready');
    assertEqual(res.account, 'pro@gmail.com');
    registerAntigravityProvider(null);
  });
});
```

`tests/unit/quota-model.test.js`:
```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import {
  normalizeState,
  updateChannelStatus,
  refreshExpiredCooldowns,
  appendHandoffHistory,
  createPendingHandoff,
  isPendingHandoffValid
} from '../../shared/quota-model.js';

describe('quota-model', () => {
  it('normalizes corrupted state and isolates multiple Google accounts', () => {
    let state = normalizeState({ schemaVersion: 999, accounts: 'bad' }, 1000);
    assertEqual(state.schemaVersion, 1);
    state = updateChannelStatus(state, {
      email: 'a@gmail.com',
      channel: 'gemini_web',
      status: 'cooldown',
      resetAt: 61000,
      source: 'auto'
    }, 1000);
    state = updateChannelStatus(state, {
      email: 'b@gmail.com',
      channel: 'gemini_web',
      status: 'ready'
    }, 1000);
    assertEqual(state.accounts['a@gmail.com'].channels.gemini_web.status, 'cooldown');
    assertEqual(state.accounts['b@gmail.com'].channels.gemini_web.status, 'ready');
  });

  it('expires elapsed or malformed cooldowns back to ready', () => {
    let state = normalizeState(null, 1000);
    state = updateChannelStatus(state, {
      email: 'a@gmail.com',
      channel: 'gemini_web',
      status: 'cooldown',
      resetAt: 5000
    }, 1000);
    state.accounts['a@gmail.com'].channels.ai_studio.status = 'cooldown';
    state.accounts['a@gmail.com'].channels.ai_studio.resetAt = 'not-a-number';

    const { state: next, expiredKeys } = refreshExpiredCooldowns(state, 6000);
    assertEqual(next.accounts['a@gmail.com'].channels.gemini_web.status, 'ready');
    assertEqual(next.accounts['a@gmail.com'].channels.gemini_web.resetAt, null);
    assertEqual(next.accounts['a@gmail.com'].channels.ai_studio.status, 'ready');
    assertEqual(expiredKeys.length, 2);
  });

  it('caps handoffHistory at 15 items with FIFO eviction', () => {
    let state = normalizeState(null, 1000);
    for (let i = 1; i <= 18; i++) {
      state = appendHandoffHistory(state, { id: `h-${i}`, markdown: `# ${i}`, createdAt: i });
    }
    assertEqual(state.handoffHistory.length, 15);
    assertEqual(state.handoffHistory[0].id, 'h-18');
    assertEqual(state.handoffHistory[14].id, 'h-4');
  });

  it('enforces 5-minute TTL on pendingHandoff and rejects invalid expiresAt', () => {
    const pending = createPendingHandoff({ markdown: '# Test' }, 10000);
    assertEqual(pending.expiresAt, 310000);
    assertEqual(isPendingHandoffValid(pending, 309999), true);
    assertEqual(isPendingHandoffValid(pending, 310001), false);
    assertEqual(isPendingHandoffValid({ markdown: '# Test', expiresAt: NaN }, 10000), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python argon-handoff-extension/tests/run_tests.py --suite quota-model`
Expected: FAIL (`shared/quota-model.js` not found).

- [ ] **Step 3: Implement `shared/channel-provider.js` and `shared/quota-model.js`**

- In `quota-model.js`, ensure `appendHandoffHistory` prepends the newest item (`[draft, ...existing].slice(0, MAX_HISTORY_ITEMS)`) and sets `state.handoffDraft = draft`.
- In `refreshExpiredCooldowns(state, nowMs = Date.now())`, any channel in `'cooldown'` whose `resetAt` is not a finite number `> 0` or has `nowMs >= resetAt` resets to `status: 'ready'` and `resetAt: null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python argon-handoff-extension/tests/run_tests.py --suite quota-model` and `python argon-handoff-extension/tests/run_tests.py --suite channel-provider`
Expected: PASS (`4 passed` and `2 passed`).

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add shared/channel-provider.js shared/quota-model.js tests/unit/channel-provider.test.js tests/unit/quota-model.test.js tests/runner.html
git -C argon-handoff-extension commit -m "feat: implement multi-account quota model, history cap, and Phase 2 hook"
```

---

### Task 4: AI Studio Billing Guard & Resilient Adapter Contract

**Files:**
- Create: `shared/billing-guard.js`
- Create: `content/adapter-contract.js`
- Create: `tests/unit/billing-guard.test.js`
- Modify: `tests/runner.html`

**Interfaces:**
- Consumes: `CHANNEL_STATUS` from `shared/constants.js`
- Produces:
  - `shared/billing-guard.js`:
    - `BILLING_REASONS = Object.freeze({ SAFE_PRO_PLAYGROUND: 'SAFE_PRO_PLAYGROUND', NO_PRO_BADGE: 'NO_PRO_BADGE', BILLING_PROMPT_DETECTED: 'BILLING_PROMPT_DETECTED' })`
    - `evaluateBillingGuard(inspection: { proBadgePresent?: boolean, billingRiskDetected?: boolean, signals?: string[] }) -> { allowAutoInject: boolean, action: 'AUTO_INJECT' | 'HOLD_AND_WARN', reasonCode: string, channelStatus: string, bannerMessage: string }`
  - `content/adapter-contract.js`:
    - `queryFirst(root: ParentNode, selectors: string[]) -> Element | null`
    - `queryAll(root: ParentNode, selectors: string[]) -> Element[]`
    - `extractMessageMarkdown(containerEl: Element) -> string` (converts `<pre><code>` blocks into fenced ` ```lang ... ``` ` markdown while preserving text paragraphs)
    - `setComposerValue(el: Element, text: string) -> boolean` (supports `<textarea>` and `[contenteditable="true"]` + dispatches `'input'` and `'change'` bubbles events)
    - `validateAdapterContract(adapter: any) -> boolean`

- [ ] **Step 1: Write the failing test (`tests/unit/billing-guard.test.js`)**

```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import { evaluateBillingGuard, BILLING_REASONS } from '../../shared/billing-guard.js';
import { validateAdapterContract, extractMessageMarkdown, setComposerValue } from '../../content/adapter-contract.js';

describe('billing-guard', () => {
  it('allows auto-inject only when PRO badge is present and no billing risk is detected', () => {
    const res = evaluateBillingGuard({ proBadgePresent: true, billingRiskDetected: false });
    assertEqual(res.allowAutoInject, true);
    assertEqual(res.action, 'AUTO_INJECT');
    assertEqual(res.reasonCode, BILLING_REASONS.SAFE_PRO_PLAYGROUND);
    assertEqual(res.channelStatus, 'ready');
  });

  it('blocks auto-inject with NO_PRO_BADGE when PRO badge is missing', () => {
    const res = evaluateBillingGuard({ proBadgePresent: false, billingRiskDetected: false });
    assertEqual(res.allowAutoInject, false);
    assertEqual(res.action, 'HOLD_AND_WARN');
    assertEqual(res.reasonCode, BILLING_REASONS.NO_PRO_BADGE);
    assertEqual(res.channelStatus, 'billing_risk');
  });

  it('blocks auto-inject with BILLING_PROMPT_DETECTED even if PRO badge is present', () => {
    const res = evaluateBillingGuard({ proBadgePresent: true, billingRiskDetected: true });
    assertEqual(res.allowAutoInject, false);
    assertEqual(res.action, 'HOLD_AND_WARN');
    assertEqual(res.reasonCode, BILLING_REASONS.BILLING_PROMPT_DETECTED);
    assertEqual(res.channelStatus, 'billing_risk');
  });

  it('extracts fenced code blocks and sets composer values via adapter-contract helpers', () => {
    const doc = new DOMParser().parseFromString(
      '<div><p>Hello</p><pre><code class="language-python">print(1)</code></pre><textarea id="t"></textarea></div>',
      'text/html'
    );
    const md = extractMessageMarkdown(doc.querySelector('div'));
    assert(md.includes('```python\nprint(1)\n```'), 'formats pre/code as fenced block');
    const ok = setComposerValue(doc.querySelector('#t'), 'test prompt');
    assertEqual(ok, true);
    assertEqual(doc.querySelector('#t').value, 'test prompt');
    assertEqual(validateAdapterContract({}), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite billing-guard`
Expected: FAIL (`shared/billing-guard.js` not found).

- [ ] **Step 3: Implement `shared/billing-guard.js` and `content/adapter-contract.js`**

- In `evaluateBillingGuard`: check `billingRiskDetected` first (`BILLING_PROMPT_DETECTED`), then `!proBadgePresent` (`NO_PRO_BADGE`), otherwise `SAFE_PRO_PLAYGROUND`.
- In `extractMessageMarkdown(containerEl)`: clone node, replace each `<pre>` with `\n\`\`\`<lang>\n<code>\n\`\`\`\n` (extracting language from `code.className` match `/language-([\w-]+)/`), and trim excess blank lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `python argon-handoff-extension/tests/run_tests.py --suite billing-guard`
Expected: PASS (`4 passed, 0 failed`).

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add shared/billing-guard.js content/adapter-contract.js tests/unit/billing-guard.test.js tests/runner.html
git -C argon-handoff-extension commit -m "feat: add AI Studio billing guard rules and DOM adapter contract helpers"
```

---

### Task 5: Isolated Site Adapters & HTML Fixture Suite

**Files:**
- Create: `content/gemini-adapter.js`
- Create: `content/aistudio-adapter.js`
- Create: `tests/fixtures/gemini-normal.html`
- Create: `tests/fixtures/gemini-flashlite-locked.html`
- Create: `tests/fixtures/aistudio-pro.html`
- Create: `tests/fixtures/aistudio-billing-risk.html`
- Create: `tests/fixtures/adapter-fixtures.test.js`
- Modify: `tests/runner.html`

**Interfaces:**
- Consumes: `CHANNELS` from `shared/constants.js`; `queryFirst`, `queryAll`, `extractMessageMarkdown`, `setComposerValue`, `validateAdapterContract` from `content/adapter-contract.js`
- Produces:
  - `content/gemini-adapter.js` (`export const geminiAdapter`) and `content/aistudio-adapter.js` (`export const aistudioAdapter`), each implementing:
    - `channelId`: `'gemini_web'` | `'ai_studio'`
    - `detectAccountEmail(doc: Document) -> string | null`
    - `inspectStatus(doc: Document) -> { modelLabel: string | null, isFlashLiteFallback: boolean, isRateLimited: boolean, proBadgePresent: boolean, billingRiskDetected: boolean, signals: string[] }`
    - `extractLatestReply(doc: Document) -> { ok: boolean, markdown?: string, reason?: string }`
    - `extractConversation(doc: Document, maxTurns?: number) -> { ok: boolean, turns?: Array<{ role: 'user' | 'assistant', content: string }>, reason?: string }`
    - `injectText(doc: Document, payload: { prompt: string, systemInstructions?: string, autoSend?: boolean }) -> Promise<{ ok: boolean, injectedFields: string[], reason?: string }>`

- [ ] **Step 1: Write the failing fixture tests and 4 HTML fixtures (`tests/fixtures/*.html`, `tests/fixtures/adapter-fixtures.test.js`)**

Create the 4 HTML fixtures representing realistic DOM structures:
- `gemini-normal.html`: Account button `aria-label="Google Account: Dev (dev@gmail.com)"`, model picker button text `"Gemini 4 Argon"`, 2 user turns (`[data-message-author-role="user"]` / `user-query`) and 2 assistant turns (`[data-message-author-role="model"]` / `model-response`) with a `<pre><code class="language-js">` block, and rich composer `div.ql-editor[contenteditable="true"]`.
- `gemini-flashlite-locked.html`: Model picker showing `"Flash-Lite"` plus banner `[role="alert"]` containing `"You've reached your Gemini 4 Argon limit"`, with existing conversation turns still in DOM.
- `aistudio-pro.html`: Account header `dev@gmail.com`, navigation tier badge `[data-test-id="tier-badge"], .tier-badge, .pro-badge` with text `"PRO"`, `textarea[aria-label*="System instructions"]`, prompt composer `textarea[aria-label*="Type something"], ms-autosize-textarea textarea`, and Run button `button[aria-label*="Run"]`.
- `aistudio-billing-risk.html`: Chat body containing user text `"I have a PRO plan"` (tests Review Focus #4 false-positive immunity!), no header `PRO` badge, and a billing banner `.billing-banner, [role="alert"]` containing `"Pay-as-you-go Cloud Billing enabled ($2 / $10 per 1M tokens)"`.

Create `tests/fixtures/adapter-fixtures.test.js`:
```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import { geminiAdapter } from '../../content/gemini-adapter.js';
import { aistudioAdapter } from '../../content/aistudio-adapter.js';
import { validateAdapterContract } from '../../content/adapter-contract.js';

async function loadDoc(name) {
  const res = await fetch(`./fixtures/${name}`);
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('adapter-fixtures', () => {
  it('validates both adapters satisfy the shared contract', () => {
    assertEqual(validateAdapterContract(geminiAdapter), true);
    assertEqual(validateAdapterContract(aistudioAdapter), true);
  });

  it('gemini-normal: detects email, Argon model, extracts reply/turns, and injects prompt', async () => {
    const doc = await loadDoc('gemini-normal.html');
    assertEqual(geminiAdapter.detectAccountEmail(doc), 'dev@gmail.com');
    const st = geminiAdapter.inspectStatus(doc);
    assertEqual(st.isFlashLiteFallback, false);
    assertEqual(st.isRateLimited, false);
    const reply = geminiAdapter.extractLatestReply(doc);
    assertEqual(reply.ok, true);
    assert(reply.markdown.includes('```js'), 'preserves code block in latest reply');
    const conv = geminiAdapter.extractConversation(doc, 10);
    assertEqual(conv.ok, true);
    assertEqual(conv.turns.length, 4);
    const inj = await geminiAdapter.injectText(doc, { prompt: 'Summarize handoff', autoSend: false });
    assertEqual(inj.ok, true);
  });

  it('gemini-flashlite-locked: detects Flash-Lite fallback & rate-limit while still extracting DOM snapshot', async () => {
    const doc = await loadDoc('gemini-flashlite-locked.html');
    const st = geminiAdapter.inspectStatus(doc);
    assertEqual(st.isFlashLiteFallback, true);
    assertEqual(st.isRateLimited, true);
    const conv = geminiAdapter.extractConversation(doc, 10);
    assertEqual(conv.ok, true);
    assert(conv.turns.length >= 2, 'DOM snapshot works even when locked');
  });

  it('aistudio-pro: detects PRO badge and injects both systemInstructions and prompt without clicking Run', async () => {
    const doc = await loadDoc('aistudio-pro.html');
    assertEqual(aistudioAdapter.detectAccountEmail(doc), 'dev@gmail.com');
    const st = aistudioAdapter.inspectStatus(doc);
    assertEqual(st.proBadgePresent, true);
    assertEqual(st.billingRiskDetected, false);
    const inj = await aistudioAdapter.injectText(doc, {
      prompt: '# Handoff Body',
      systemInstructions: 'Act as Architect',
      autoSend: false
    });
    assertEqual(inj.ok, true);
    assertEqual(inj.injectedFields.includes('prompt'), true);
    assertEqual(inj.injectedFields.includes('systemInstructions'), true);
  });

  it('aistudio-billing-risk: ignores PRO text inside chat turns and flags billing risk', async () => {
    const doc = await loadDoc('aistudio-billing-risk.html');
    const st = aistudioAdapter.inspectStatus(doc);
    assertEqual(st.proBadgePresent, false);
    assertEqual(st.billingRiskDetected, true);
  });

  it('empty DOM: returns structured SELECTOR_NOT_FOUND without throwing', async () => {
    const emptyDoc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    assertEqual(geminiAdapter.extractLatestReply(emptyDoc).reason, 'SELECTOR_NOT_FOUND');
    assertEqual(geminiAdapter.extractConversation(emptyDoc).reason, 'SELECTOR_NOT_FOUND');
    assertEqual((await geminiAdapter.injectText(emptyDoc, { prompt: 'x' })).reason, 'SELECTOR_NOT_FOUND');
    assertEqual((await aistudioAdapter.injectText(emptyDoc, { prompt: 'x' })).reason, 'SELECTOR_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite adapter-fixtures`
Expected: FAIL (`content/gemini-adapter.js` not found).

- [ ] **Step 3: Implement `content/gemini-adapter.js` and `content/aistudio-adapter.js`**

- In `detectAccountEmail(doc)`: scan `a[aria-label*="@"], button[aria-label*="@"], [data-email], img[alt*="@"]` and extract `/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/`.
- In `aistudioAdapter.inspectStatus(doc)`: only match `PRO` badge inside header/nav/sidebar badge elements (`header, nav, .nav-bar, .tier-badge, [data-test-id*="tier"], [data-test-id*="pro-badge"], .pro-badge`) where trimmed text is `/\bPRO\b/` and NEVER inside chat turn containers (`ms-chat-turn, [data-message-author-role], .chat-turn`). Flag `billingRiskDetected = true` if header/banner/alert elements match `/pay-as-you-go|cloud billing|api key billing|\$2\s*\/\s*\$10|free tier/i`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python argon-handoff-extension/tests/run_tests.py --suite adapter-fixtures`
Expected: PASS (`6 passed, 0 failed`).

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add content/gemini-adapter.js content/aistudio-adapter.js tests/fixtures/ tests/runner.html
git -C argon-handoff-extension commit -m "feat: implement isolated Gemini Web and AI Studio DOM adapters with fixture tests"
```

---

### Task 6: Manifest V3, Background Service Worker & Content Loader/Pill

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `content/floating-pill.js`
- Create: `content/content-loader.js`
- Create: `tests/unit/background-router.test.js`
- Modify: `tests/runner.html`

**Interfaces:**
- Consumes: `shared/constants.js`, `shared/handoff-builder.js`, `shared/quota-model.js`, `shared/billing-guard.js`, `shared/channel-provider.js`
- Produces:
  - `background.js`:
    - `createBackgroundController(env: { storage: { get: () => Promise<object>, set: (s: object) => Promise<void> }, tabs: { create: (opts: object) => Promise<any>, query: (q: object) => Promise<any[]>, sendMessage: (tabId: number, msg: object) => Promise<any> }, downloads: { download: (opts: object) => Promise<number> }, alarms: { create: (name: string, info: object) => void } }) -> { handleMessage: (msg: object, sender?: object) => Promise<object>, handleAlarm: (alarm: { name: string }) => Promise<void> }`
  - `content/floating-pill.js`:
    - `mountFloatingPill(doc: Document, options: { channelId: string, onPromptHandoff: () => void, onDomSnapshot: () => void, onOpenSidePanel: () => void, onConfirmPendingInject?: () => void }) -> { updateBadge: (state: { label: string, tone: 'ok' | 'warn' | 'danger', showConfirmInject?: boolean }) => void, destroy: () => void }`

- [ ] **Step 1: Write the failing test (`tests/unit/background-router.test.js`)**

```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import { MESSAGE_TYPES } from '../../shared/constants.js';
import { createBackgroundController } from '../../background.js';
import { mountFloatingPill } from '../../content/floating-pill.js';

function createMockEnv() {
  let store = {};
  const openedUrls = [];
  const downloads = [];
  const alarms = [];
  return {
    openedUrls,
    downloads,
    alarms,
    env: {
      storage: {
        async get() { return store; },
        async set(next) { store = next; }
      },
      tabs: {
        async create({ url }) { openedUrls.push(url); return { id: 99, url }; },
        async query() { return [{ id: 1, url: 'https://gemini.google.com/app' }]; },
        async sendMessage() { return { ok: true }; }
      },
      downloads: {
        async download(opts) { downloads.push(opts); return 1; }
      },
      alarms: {
        create(name, info) { alarms.push({ name, info }); }
      }
    }
  };
}

describe('background-router', () => {
  it('serializes concurrent CONSUME_PENDING_HANDOFF so only the first caller succeeds', async () => {
    const { env, openedUrls } = createMockEnv();
    const ctrl = createBackgroundController(env);

    await ctrl.handleMessage({
      type: MESSAGE_TYPES.PREPARE_AISTUDIO_HANDOFF,
      markdown: '# Context',
      systemPrompt: 'System rules',
      sourceEmail: 'dev@gmail.com'
    });
    assertEqual(openedUrls[0], 'https://aistudio.google.com/prompts/new_chat');

    const [first, second] = await Promise.all([
      ctrl.handleMessage({ type: MESSAGE_TYPES.CONSUME_PENDING_HANDOFF }),
      ctrl.handleMessage({ type: MESSAGE_TYPES.CONSUME_PENDING_HANDOFF })
    ]);
    assertEqual(first.ok, true);
    assertEqual(first.handoff.markdown, '# Context');
    assertEqual(second.ok, false);
    assertEqual(second.reason, 'EMPTY');
  });

  it('exports Antigravity markdown via downloads API with uniquify conflictAction', async () => {
    const { env, downloads } = createMockEnv();
    const ctrl = createBackgroundController(env);
    const res = await ctrl.handleMessage({
      type: MESSAGE_TYPES.EXPORT_ANTIGRAVITY_MD,
      markdown: '# Handoff',
      title: 'Quota Fix'
    });
    assertEqual(res.ok, true);
    assertEqual(downloads.length, 1);
    assertEqual(downloads[0].conflictAction, 'uniquify');
    assert(downloads[0].filename.startsWith('argon-handoffs/handoff-'), 'saves in argon-handoffs/');
    assert(res.continuationPrompt.includes('.md'), 'returns continuation prompt');
  });

  it('mounts Shadow DOM floating pill and updates Billing Guard warning state', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const pill = mountFloatingPill(doc, {
      channelId: 'ai_studio',
      onPromptHandoff() {},
      onDomSnapshot() {},
      onOpenSidePanel() {}
    });
    const host = doc.querySelector('#argon-handoff-pill-host');
    assert(host && host.shadowRoot, 'creates ShadowRoot');
    pill.updateBadge({ label: 'BILLING RISK: NO PRO BADGE', tone: 'danger', showConfirmInject: true });
    assert(host.shadowRoot.textContent.includes('BILLING RISK'), 'renders badge text');
    pill.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite background-router`
Expected: FAIL (`background.js` not found).

- [ ] **Step 3: Implement `manifest.json`, `background.js`, `content/floating-pill.js`, and `content/content-loader.js`**

- In `background.js`: export `createBackgroundController(env)` with an internal promise queue (`let mutex = Promise.resolve()`) wrapping state reads/writes so `CONSUME_PENDING_HANDOFF` is strictly atomic even when two tabs call it concurrently. Only wire `chrome.runtime.onMessage` / `chrome.alarms.onAlarm` when `typeof chrome !== 'undefined' && chrome.runtime?.id` is present so `background.js` can be imported directly in unit tests.
- In `content/content-loader.js`: detect hostname (`gemini.google.com` vs `aistudio.google.com`), dynamically `import(chrome.runtime.getURL(...))` the matching adapter, `floating-pill.js`, and `billing-guard.js`, mount the Floating Pill, report page status via `REPORT_PAGE_STATUS`, and on `aistudio.google.com` watch with `MutationObserver` (up to `15000` ms) to consume any `pendingHandoff` and enforce `evaluateBillingGuard` before injecting.

- [ ] **Step 4: Run test to verify it passes**

Run: `python argon-handoff-extension/tests/run_tests.py --suite background-router`
Expected: PASS (`3 passed, 0 failed`).

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add manifest.json background.js content/floating-pill.js content/content-loader.js tests/unit/background-router.test.js tests/runner.html
git -C argon-handoff-extension commit -m "feat: add MV3 manifest, atomic background router, and Shadow DOM floating pill"
```

---

### Task 7: Side Panel Workbench UI & Full Suite Verification

**Files:**
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`
- Create: `sidepanel/sidepanel.js`
- Create: `tests/unit/sidepanel-controller.test.js`
- Modify: `tests/runner.html`

**Interfaces:**
- Consumes: `shared/constants.js`, `shared/quota-model.js`, `shared/handoff-builder.js`, `shared/billing-guard.js`
- Produces:
  - `sidepanel/sidepanel.js`:
    - `initSidePanelController(rootDoc: Document, bridge: { getState: () => Promise<object>, sendMessage: (msg: object) => Promise<object>, writeClipboard: (text: string) => Promise<void> }) -> Promise<{ render: (state: object) => void }>`

- [ ] **Step 1: Write the failing test (`tests/unit/sidepanel-controller.test.js`)**

```javascript
import { describe, it, assertEqual, assert } from '../test-harness.js';
import { normalizeState, updateChannelStatus, appendHandoffHistory } from '../../shared/quota-model.js';
import { initSidePanelController } from '../../sidepanel/sidepanel.js';

async function loadSidePanelDoc() {
  const res = await fetch('../sidepanel/sidepanel.html');
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('sidepanel-controller', () => {
  it('renders multi-account matrix, billing risk banner, pre-run checklist, and draft editor', async () => {
    const doc = await loadSidePanelDoc();
    let state = normalizeState(null, 1000);
    state.activeEmail = 'pro@gmail.com';
    state = updateChannelStatus(state, {
      email: 'pro@gmail.com',
      channel: 'ai_studio',
      status: 'billing_risk',
      proBadgeSeen: false,
      billingRisk: true
    }, 1000);
    state = appendHandoffHistory(state, {
      id: 'h-1',
      sourceChannel: 'gemini_web',
      accountEmail: 'pro@gmail.com',
      titleSlug: 'test-task',
      markdown: '## Objective\nTest UI',
      createdAt: 1000
    });

    const sentMessages = [];
    const ctrl = await initSidePanelController(doc, {
      async getState() { return state; },
      async sendMessage(msg) { sentMessages.push(msg); return { ok: true, continuationPrompt: '@handoff.md' }; },
      async writeClipboard() { throw new Error('Document not focused'); } // triggers fallback textarea
    });

    ctrl.render(state);
    assert(doc.querySelector('#billing-guard-banner') && !doc.querySelector('#billing-guard-banner').hidden, 'shows billing risk banner');
    assertEqual(doc.querySelector('#handoff-markdown-input').value, '## Objective\nTest UI');
    assertEqual(doc.querySelectorAll('.checklist-item input[type="checkbox"]').length, 3);

    doc.querySelector('#btn-export-antigravity').click();
    await new Promise((r) => setTimeout(r, 20));
    assertEqual(sentMessages[0].type, 'EXPORT_ANTIGRAVITY_MD');
    assert(!doc.querySelector('#clipboard-fallback-box').hidden, 'reveals selectable fallback box when clipboard API throws');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python argon-handoff-extension/tests/run_tests.py --suite sidepanel-controller`
Expected: FAIL (`sidepanel/sidepanel.js` not found).

- [ ] **Step 3: Implement `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, and `sidepanel/sidepanel.js`**

- Build high-contrast Obsidian Dark (`#0d1117` background, `#161b22` cards, `#f0f6fc` text) Side Panel layout containing:
  1. `#account-selector` + manual email assignment input + 3-channel status cards (`gemini_web`, `ai_studio`, `antigravity` with Mark Cooldown / Reset buttons).
  2. `#billing-guard-banner` (hidden when `ai_studio` is safe; visible red alert when `status === 'billing_risk'` or `proBadgeSeen === false`).
  3. Action buttons: `#btn-prompt-handoff`, `#btn-dom-snapshot`, `#btn-send-aistudio`, `#btn-export-antigravity`.
  4. AI Studio Pre-Run Checklist (3 checkboxes: `PRO Badge Verified`, `Thinking = High`, `Google Search Grounding`).
  5. `#handoff-system-input`, `#handoff-markdown-input`, `#clipboard-fallback-box` (shown automatically whenever `navigator.clipboard.writeText` throws), and `#handoff-history-list` (up to 15 recent items).

- [ ] **Step 4: Run full test suite and verify all suites pass**

Run: `python argon-handoff-extension/tests/run_tests.py`
Expected: PASS (all 8 suites — `constants`, `handoff-builder`, `channel-provider`, `quota-model`, `billing-guard`, `adapter-fixtures`, `background-router`, `sidepanel-controller` — `0 failed`).

- [ ] **Step 5: Commit**

```bash
git -C argon-handoff-extension add sidepanel/ tests/unit/sidepanel-controller.test.js tests/runner.html
git -C argon-handoff-extension commit -m "feat: add Side Panel Workbench UI and complete unit/fixture test suite"
```
