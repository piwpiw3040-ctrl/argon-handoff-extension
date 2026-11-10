import { CHANNELS } from '../shared/constants.js';
import { queryFirst, queryAll, extractMessageMarkdown, setComposerValue } from './adapter-contract.js';

export const geminiAdapter = {
  channelId: CHANNELS.GEMINI_WEB,

  detectAccountEmail(doc) {
    if (!doc) return null;
    const candidates = queryAll(doc, [
      'button[aria-label*="@"]',
      'a[aria-label*="@"]',
      '[data-email]',
      'img[alt*="@"]',
      'div[aria-label*="@"]'
    ]);

    for (const el of candidates) {
      const text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-email') || ''} ${el.getAttribute('alt') || ''}`;
      const m = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) return m[1];
    }
    return null;
  },

  inspectStatus(doc) {
    const signals = [];
    let modelLabel = null;
    let isFlashLiteFallback = false;
    let isRateLimited = false;

    const modelEl = queryFirst(doc, [
      '.model-picker button',
      'button[aria-label*="Model" i]',
      'button[aria-label*="Gemini" i]',
      '.current-model-title'
    ]);
    if (modelEl) {
      modelLabel = (modelEl.textContent || modelEl.getAttribute('aria-label') || '').trim();
      signals.push(`ModelLabel: ${modelLabel}`);
      if (/flash-lite|flash lite/i.test(modelLabel)) {
        isFlashLiteFallback = true;
      }
    }

    const alertEls = queryAll(doc, [
      '[role="alert"]',
      '.rate-limit-banner',
      '.limit-reached-message',
      '.warning-banner'
    ]);

    for (const el of alertEls) {
      const text = el.textContent || '';
      if (/limit|hourly limit|exceeded|switched to flash/i.test(text)) {
        isRateLimited = true;
        signals.push(`Alert: ${text.trim().slice(0, 80)}`);
        if (/flash-lite|flash lite/i.test(text)) {
          isFlashLiteFallback = true;
        }
      }
    }

    return {
      modelLabel,
      isFlashLiteFallback,
      isRateLimited,
      proBadgePresent: false,
      billingRiskDetected: false,
      signals
    };
  },

  extractLatestReply(doc) {
    if (!doc) return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    const modelTurns = queryAll(doc, [
      '[data-message-author-role="model"]',
      '.model-response',
      'message-content[role="presentation"]',
      '.chat-turn[data-role="model"]'
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
      '.chat-history .chat-turn',
      '[data-message-author-role]',
      '.conversation-turn',
      '.chat-turn'
    ]);

    if (!turns || turns.length === 0) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    const list = [];
    for (const t of turns) {
      const roleAttr = (t.getAttribute('data-message-author-role') || t.getAttribute('data-role') || '').toLowerCase();
      let role = 'user';
      if (roleAttr === 'model' || roleAttr === 'assistant' || t.classList.contains('model-response')) {
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

  async injectText(doc, { prompt, autoSend = false } = {}) {
    if (!doc || !prompt) return { ok: false, reason: 'SELECTOR_NOT_FOUND' };

    const composer = queryFirst(doc, [
      'div.ql-editor[contenteditable="true"]',
      '[contenteditable="true"][aria-label*="Gemini" i]',
      'textarea[aria-label*="Ask Gemini" i]',
      'textarea[aria-label*="Prompt" i]',
      'div.ql-editor',
      'textarea'
    ]);

    if (!composer) {
      return { ok: false, reason: 'SELECTOR_NOT_FOUND' };
    }

    const ok = setComposerValue(composer, prompt);
    if (!ok) {
      return { ok: false, reason: 'INJECTION_FAILED' };
    }

    const injectedFields = ['prompt'];
    if (autoSend) {
      const sendBtn = queryFirst(doc, [
        'button[aria-label*="Send message" i]',
        'button[aria-label*="Send" i]',
        'button.send-button'
      ]);
      if (sendBtn) {
        sendBtn.click();
        injectedFields.push('sendClicked');
      }
    }

    return { ok: true, injectedFields };
  }
};
