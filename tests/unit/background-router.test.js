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
