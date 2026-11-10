import { describe, it, assertEqual, assert } from '../test-harness.js';
import { MESSAGE_TYPES } from '../../shared/constants.js';
import { createBackgroundController } from '../../background.js';
import { mountFloatingPill } from '../../content/floating-pill.js';

function createMockEnv() {
  let store = {};
  const openedUrls = [];
  const downloads = [];
  const alarms = [];
  const tabMessages = [];
  return {
    getStore: () => store,
    openedUrls,
    downloads,
    alarms,
    tabMessages,
    env: {
      storage: {
        async get() { return store; },
        async set(next) { store = next; }
      },
      tabs: {
        async create({ url }) { openedUrls.push(url); return { id: 99, url }; },
        async query() { return [{ id: 1, url: 'https://gemini.google.com/app' }]; },
        async sendMessage(tabId, msg) { tabMessages.push({ tabId, msg }); return { ok: true }; }
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

  it('handles OPEN_SIDE_PANEL message from content script', async () => {
    const { env } = createMockEnv();
    const ctrl = createBackgroundController(env);
    const res = await ctrl.handleMessage({ type: MESSAGE_TYPES.OPEN_SIDE_PANEL }, { tab: { windowId: 10 } });
    assertEqual(res.ok, true);
  });

  it('persists draft in handoffHistory during PREPARE_AISTUDIO_HANDOFF and routes INJECT_HANDOFF_PROMPT / CAPTURE_HANDOFF to active tab', async () => {
    const { env, getStore, tabMessages } = createMockEnv();
    const ctrl = createBackgroundController(env);

    await ctrl.handleMessage({
      type: MESSAGE_TYPES.PREPARE_AISTUDIO_HANDOFF,
      markdown: '# Context',
      systemPrompt: 'Rules',
      sourceEmail: 'dev@gmail.com',
      draft: { id: 'draft-1', titleSlug: 'arch-plan', markdown: '# Context', createdAt: 1000 }
    });

    const saved = getStore();
    assertEqual(saved.handoffHistory.length, 1);
    assertEqual(saved.handoffHistory[0].id, 'draft-1');
    assert(saved.pendingHandoff && saved.pendingHandoff.markdown === '# Context', 'preserves pendingHandoff alongside history');

    // Forwarding INJECT_HANDOFF_PROMPT and CAPTURE_HANDOFF (without draft) to active tab
    const injRes = await ctrl.handleMessage({ type: MESSAGE_TYPES.INJECT_HANDOFF_PROMPT });
    assertEqual(injRes.ok, true);
    assertEqual(tabMessages[0].tabId, 1);
    assertEqual(tabMessages[0].msg.type, MESSAGE_TYPES.INJECT_HANDOFF_PROMPT);

    const capRes = await ctrl.handleMessage({ type: MESSAGE_TYPES.CAPTURE_HANDOFF });
    assertEqual(capRes.ok, true);
    assertEqual(tabMessages[1].tabId, 1);
    assertEqual(tabMessages[1].msg.type, MESSAGE_TYPES.CAPTURE_HANDOFF);

    // Saving captured draft when draft payload is provided
    await ctrl.handleMessage({
      type: MESSAGE_TYPES.CAPTURE_HANDOFF,
      draft: { id: 'draft-2', titleSlug: 'dom-snap', markdown: '# Snap', createdAt: 2000 }
    });
    assertEqual(getStore().handoffHistory.length, 2);
    assertEqual(getStore().handoffHistory[0].id, 'draft-2');
  });
});
