import { CHANNELS } from '../shared/constants.js';
import { queryFirst, queryAll, extractMessageMarkdown, setComposerValue } from './adapter-contract.js';

export const aistudioAdapter = {
  channelId: CHANNELS.AI_STUDIO,

  detectAccountEmail(doc) {
    if (!doc) return null;
    const candidates = queryAll(doc, [
      'nav [data-email]',
      'header [data-email]',
      '.user-badge',
      'button[aria-label*="@"]',
      'a[aria-label*="@"]',
      '[data-email]'
    ]);

    for (const el of candidates) {
      const text = `${el.getAttribute('data-email') || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
      const m = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) return m[1];
    }
    return null;
  },

  inspectStatus(doc) {
    const signals = [];
    let proBadgePresent = false;
    let billingRiskDetected = false;
    let modelLabel = null;

    // Check header / navigation badges exclusively (NEVER match inside user chat turns)
    const navBadges = queryAll(doc, [
      'nav .tier-badge',
      'header .tier-badge',
      '[data-test-id="tier-badge"]',
      '[data-test-id*="pro-badge"]',
      '.pro-badge',
      'nav [aria-label*="tier" i]'
    ]);

    for (const b of navBadges) {
      const text = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (/\bPRO\b/i.test(text)) {
        proBadgePresent = true;
        signals.push('NavTier: PRO');
        break;
      }
    }

    // Check for billing warnings, pay-as-you-go alerts, or API pricing notices
    const banners = queryAll(doc, [
      '[role="alert"]',
      '.billing-banner',
      '.billing-warning',
      '.cost-indicator',
      '.notice-bar'
    ]);

    for (const banner of banners) {
      const text = banner.textContent || '';
      if (/pay-as-you-go|cloud billing|api key billing|\$2\s*\/\s*\$10|free tier/i.test(text)) {
        billingRiskDetected = true;
        signals.push(`BillingNotice: ${text.trim().slice(0, 80)}`);
      }
    }

    const modelEl = queryFirst(doc, [
      'button[aria-label*="Model" i]',
      '.model-selector-button',
      '.selected-model-name'
    ]);
    if (modelEl) {
      modelLabel = (modelEl.textContent || '').trim();
    }

    return {
      modelLabel,
      isFlashLiteFallback: false,
      isRateLimited: false,
      proBadgePresent,
      billingRiskDetected,
      signals
    };
  },

  extractLatestReply(doc) {
    if (!doc) return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    const modelTurns = queryAll(doc, [
      'ms-chat-turn[data-role="model"]',
      '.chat-turn.model',
      '[data-message-author-role="model"]',
      '.assistant-response'
    ]);

    if (!modelTurns || modelTurns.length === 0) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    const last = modelTurns[modelTurns.length - 1];
    const md = extractMessageMarkdown(last);
    if (!md) {
      return { ok: false, reason: 'EMPTY_CONTENT' };
    }

    return { ok: true, markdown: md };
  },

  extractConversation(doc, maxTurns = 12) {
    if (!doc) return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    const turns = queryAll(doc, [
      'ms-chat-turn',
      '.chat-turn',
      '[data-message-author-role]'
    ]);

    if (!turns || turns.length === 0) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    const list = [];
    for (const t of turns) {
      const roleAttr = (t.getAttribute('data-role') || t.getAttribute('data-message-author-role') || '').toLowerCase();
      let role = 'user';
      if (roleAttr === 'model' || roleAttr === 'assistant' || t.classList.contains('model')) {
        role = 'assistant';
      }
      const content = extractMessageMarkdown(t);
      if (content) {
        list.push({ role, content });
      }
    }

    if (list.length === 0) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    return { ok: true, turns: list.slice(-maxTurns) };
  },

  async injectText(doc, { prompt, systemInstructions = '', autoSend = false } = {}) {
    if (!doc || !prompt) return { ok: false, reason: 'SELECTOR_NOT_FOUND' };

    const injectedFields = [];

    // Optional System Instructions field
    if (systemInstructions) {
      const sysComposer = queryFirst(doc, [
        'textarea[aria-label*="System instructions" i]',
        'textarea[placeholder*="System instructions" i]',
        '.system-instructions-panel textarea'
      ]);
      if (sysComposer) {
        const okSys = setComposerValue(sysComposer, systemInstructions);
        if (okSys) {
          injectedFields.push('systemInstructions');
        }
      }
    }

    // Main Prompt composer
    const promptComposer = queryFirst(doc, [
      'textarea[aria-label*="Type something" i]',
      'textarea[aria-label*="Prompt" i]',
      'textarea[placeholder*="Prompt" i]',
      'ms-autosize-textarea textarea',
      '.prompt-panel textarea',
      'textarea'
    ]);

    if (!promptComposer) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    const okPrompt = setComposerValue(promptComposer, prompt);
    if (!okPrompt) {
      return { ok: false, reason: 'INJECTION_FAILED' };
    }
    injectedFields.push('prompt');

    if (autoSend) {
      const runBtn = queryFirst(doc, [
        'button[aria-label*="Run" i]',
        'button.run-button'
      ]);
      if (runBtn) {
        runBtn.click();
        injectedFields.push('runClicked');
      }
    }

    return { ok: true, injectedFields };
  }
};
