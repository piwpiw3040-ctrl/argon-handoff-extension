import { MESSAGE_TYPES, CHANNELS, CHANNEL_STATUS } from './shared/constants.js';
import {
  normalizeState,
  updateChannelStatus,
  refreshExpiredCooldowns,
  createPendingHandoff,
  isPendingHandoffValid,
  appendHandoffHistory
} from './shared/quota-model.js';
import { buildAntigravityExport } from './shared/handoff-builder.js';

export function createBackgroundController(env) {
  let mutex = Promise.resolve();

  function withLock(fn) {
    const next = mutex.then(fn, fn);
    mutex = next.catch(() => {});
    return next;
  }

  async function getState() {
    const raw = await env.storage.get();
    return normalizeState(raw);
  }

  async function saveState(nextState) {
    await env.storage.set(nextState);
  }

  async function handleMessage(msg, sender = {}) {
    if (!msg || !msg.type) {
      return { ok: false, reason: 'INVALID_MESSAGE' };
    }

    switch (msg.type) {
      case MESSAGE_TYPES.PREPARE_AISTUDIO_HANDOFF: {
        return withLock(async () => {
          const state = await getState();
          const pending = createPendingHandoff({
            target: CHANNELS.AI_STUDIO,
            markdown: msg.markdown,
            systemPrompt: msg.systemPrompt,
            sourceEmail: msg.sourceEmail || state.activeEmail
          });

          state.pendingHandoff = pending;
          if (msg.draft) {
            appendHandoffHistory(state, msg.draft);
          }
          await saveState(state);

          const tab = await env.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat' });
          return { ok: true, pending, tabId: tab ? tab.id : null };
        });
      }

      case MESSAGE_TYPES.CONSUME_PENDING_HANDOFF: {
        return withLock(async () => {
          const state = await getState();
          const pending = state.pendingHandoff;
          if (!pending || !isPendingHandoffValid(pending)) {
            state.pendingHandoff = null;
            await saveState(state);
            return { ok: false, reason: 'EMPTY' };
          }

          state.pendingHandoff = null;
          await saveState(state);
          return { ok: true, handoff: pending };
        });
      }

      case MESSAGE_TYPES.EXPORT_ANTIGRAVITY_MD: {
        const { markdown, title } = msg;
        const exportInfo = buildAntigravityExport({ markdown, title });
        const encodedUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown || '');

        const downloadId = await env.downloads.download({
          url: encodedUri,
          filename: exportInfo.filePath,
          conflictAction: 'uniquify',
          saveAs: false
        });

        return {
          ok: true,
          downloadId,
          fileName: exportInfo.fileName,
          filePath: exportInfo.filePath,
          continuationPrompt: exportInfo.continuationPrompt
        };
      }

      case MESSAGE_TYPES.UPDATE_CHANNEL_STATUS: {
        return withLock(async () => {
          let state = await getState();
          state = updateChannelStatus(state, msg);
          await saveState(state);

          if (msg.status === CHANNEL_STATUS.COOLDOWN && msg.resetAt) {
            const delayInMinutes = Math.max(1, Math.ceil((msg.resetAt - Date.now()) / 60000));
            env.alarms.create(`cooldown-${msg.email}-${msg.channel}`, { delayInMinutes });
          }

          return { ok: true, state };
        });
      }

      case MESSAGE_TYPES.REPORT_PAGE_STATUS: {
        return withLock(async () => {
          let state = await getState();
          if (msg.email && msg.email !== state.activeEmail && msg.email !== 'default-profile') {
            state.activeEmail = msg.email;
          }
          state = updateChannelStatus(state, {
            email: msg.email || state.activeEmail,
            channel: msg.channelId,
            status: msg.channelStatus || CHANNEL_STATUS.READY,
            proBadgeSeen: msg.proBadgePresent,
            billingRisk: msg.billingRiskDetected,
            lastSignal: msg.signals ? msg.signals.join(' | ') : null
          });
          await saveState(state);
          return { ok: true };
        });
      }

      default:
        return { ok: false, reason: 'UNKNOWN_TYPE' };
    }
  }

  async function handleAlarm(alarm) {
    await withLock(async () => {
      let state = await getState();
      const { state: nextState } = refreshExpiredCooldowns(state);
      await saveState(nextState);
    });
  }

  return {
    handleMessage,
    handleAlarm
  };
}

// Browser runtime initialization
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  const browserEnv = {
    storage: {
      get: () => new Promise((resolve) => chrome.storage.local.get(null, resolve)),
      set: (data) => new Promise((resolve) => chrome.storage.local.set(data, resolve))
    },
    tabs: {
      create: (opts) => chrome.tabs.create(opts),
      query: (q) => chrome.tabs.query(q),
      sendMessage: (tabId, msg) => chrome.tabs.sendMessage(tabId, msg)
    },
    downloads: {
      download: (opts) => chrome.downloads.download(opts)
    },
    alarms: {
      create: (name, info) => chrome.alarms.create(name, info)
    }
  };

  const controller = createBackgroundController(browserEnv);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    controller.handleMessage(msg, sender).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    });
    return true; // asynchronous response
  });

  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      controller.handleAlarm(alarm).catch(() => {});
    });
  }
}
