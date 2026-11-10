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

    doc.querySelector('#btn-prompt-handoff').click();
    await new Promise((r) => setTimeout(r, 20));
    assertEqual(sentMessages[1].type, 'INJECT_HANDOFF_PROMPT');

    doc.querySelector('#btn-dom-snapshot').click();
    await new Promise((r) => setTimeout(r, 20));
    assertEqual(sentMessages[2].type, 'CAPTURE_HANDOFF');
  });

  it('prevents DOM XSS when rendering malicious HTML payloads in handoffHistory and refreshes editor on new draft ID', async () => {
    const doc = await loadSidePanelDoc();
    let state = normalizeState(null, 1000);
    state = appendHandoffHistory(state, {
      id: 'xss-1',
      sourceChannel: '<script>window.__xss=1</script>',
      accountEmail: '<img src=x onerror="window.__xss=2">',
      titleSlug: '<svg onload="window.__xss=3">',
      markdown: '## Initial Draft',
      createdAt: 1000
    });

    const ctrl = await initSidePanelController(doc, {
      async getState() { return state; },
      async sendMessage() { return { ok: true }; },
      async writeClipboard() {}
    });

    const historyEl = doc.querySelector('#handoff-history-list');
    assertEqual(historyEl.querySelectorAll('img, svg, script').length, 0);
    assert(historyEl.textContent.includes('<svg onload="window.__xss=3">'), 'renders HTML tags safely as literal text');

    // Verify new handoffDraft with a new ID updates non-empty editor inputs
    state = appendHandoffHistory(state, {
      id: 'draft-new-2',
      sourceChannel: 'gemini_web',
      accountEmail: 'pro@gmail.com',
      titleSlug: 'updated-slug',
      markdown: '## Newly Captured DOM Snapshot',
      systemInstructions: 'New System Rules',
      createdAt: 2000
    });
    ctrl.render(state);
    assertEqual(doc.querySelector('#handoff-title-input').value, 'updated-slug');
    assertEqual(doc.querySelector('#handoff-markdown-input').value, '## Newly Captured DOM Snapshot');
    assertEqual(doc.querySelector('#handoff-system-input').value, 'New System Rules');
  });
});
