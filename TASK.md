# TASK.md — Argon Cross-Channel Handoff & Quota Extension (Sub-project 1)

## 🎯 Active Objective
Build **Sub-project 1 (`argon-handoff-extension`)**: a zero-build Chromium Manifest V3 extension (ES2022 modules, Shadow DOM Floating Pill + Side Panel Workbench) for managing multi-account Gemini 4 Argon quota states, AI Studio Billing Guard, and Dual-Mode `.md` Handoffs across:
1. **Channel 1:** `gemini.google.com` (Gemini Web)
2. **Channel 2:** `aistudio.google.com` (Google AI Studio Playground)
3. **Channel 3:** `Antigravity` (`.md` export to `Downloads/argon-handoffs/` + Clipboard continuation prompt + Phase-2 `ChannelProvider` hook)

## ⚙️ Technical Constraints
- **Zero-Build Native ES Modules:** Host Windows PC has `Python 3.12.10` and `Microsoft Edge` (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`), with no `node`/`npm`.
- **Automated Testing:** Run `python argon-handoff-extension/tests/run_tests.py` (uses Python `http.server` + headless Edge callback to execute all 8 browser ES-module unit & DOM fixture test suites).
- **Reference Documents:**
  - Design Spec: `docs/superpowers/specs/2026-11-10-argon-handoff-extension-design.md`
  - Implementation Plan: `docs/superpowers/plans/2026-11-10-argon-handoff-extension.md`

## 📋 Progress Checklist
- [x] Brainstorming & Architecture Design approved
- [x] Design Spec written & committed (`docs/superpowers/specs/2026-11-10-argon-handoff-extension-design.md`)
- [x] Detailed Implementation Plan & Test Suite Plan written by Argon (`docs/superpowers/plans/2026-11-10-argon-handoff-extension.md`)
- [x] **Task 1:** Headless Browser Test Harness & Shared Constants (`shared/constants.js`, `tests/run_tests.py`, `tests/runner.html`, `tests/test-harness.js`, `tests/unit/constants.test.js`)
- [x] **Task 2:** Handoff Markdown Builder & Slug/Prompt Formatter (`shared/handoff-builder.js`, `tests/unit/handoff-builder.test.js`)
- [x] **Task 3:** Multi-Account Quota Model, Ring Buffer & Phase-2 Provider Hook (`shared/channel-provider.js`, `shared/quota-model.js`, `tests/unit/channel-provider.test.js`, `tests/unit/quota-model.test.js`)
- [x] **Task 4:** AI Studio Billing Guard & Resilient Adapter Contract (`shared/billing-guard.js`, `content/adapter-contract.js`, `tests/unit/billing-guard.test.js`)
- [x] **Task 5:** Isolated Site Adapters & HTML Fixture Suite (`content/gemini-adapter.js`, `content/aistudio-adapter.js`, `tests/fixtures/*.html`, `tests/fixtures/adapter-fixtures.test.js`)
- [x] **Task 6:** Manifest V3, Background Service Worker & Content Loader/Pill (`manifest.json`, `background.js`, `content/floating-pill.js`, `content/content-loader.js`, `tests/unit/background-router.test.js`)
- [x] **Task 7:** Side Panel Workbench UI & Full Suite Verification (`sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js`, `tests/unit/sidepanel-controller.test.js`)
- [x] **Task 8 (UI/UX Pro Max):** Apple iOS Luxury Dark Glassmorphism Redesign (`sidepanel/sidepanel.css`, `content/floating-pill.js`) — Liquid Glass, Dynamic Island capsule, OLED dark surfaces, tactile Apple spring dynamics, 27/27 tests green.

## 🚀 Next Step
All tasks and tests are 100% complete and passing (27/27 tests green). Reload the extension in `edge://extensions` to experience the new Apple iOS luxury dark glassmorphism interface!
