import {
  SCHEMA_VERSION,
  DEFAULT_ACCOUNT_KEY,
  MAX_HISTORY_ITEMS,
  PENDING_HANDOFF_TTL_MS,
  DEFAULT_SETTINGS,
  CHANNELS,
  CHANNEL_STATUS
} from './constants.js';
import { createDefaultAntigravityStatus } from './channel-provider.js';

export function createEmptyAccountRecord(nowMs = Date.now()) {
  return {
    updatedAt: nowMs,
    channels: {
      [CHANNELS.GEMINI_WEB]: {
        status: CHANNEL_STATUS.READY,
        resetAt: null,
        source: 'auto',
        lastSignal: null
      },
      [CHANNELS.AI_STUDIO]: {
        status: CHANNEL_STATUS.READY,
        proBadgeSeen: false,
        billingRisk: false,
        resetAt: null,
        source: 'auto',
        lastCheckedAt: nowMs
      },
      [CHANNELS.ANTIGRAVITY]: createDefaultAntigravityStatus()
    }
  };
}

export function normalizeState(rawState, nowMs = Date.now()) {
  const state = (rawState && typeof rawState === 'object') ? rawState : {};

  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    activeEmail: (typeof state.activeEmail === 'string' && state.activeEmail.trim()) || DEFAULT_ACCOUNT_KEY,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(state.settings && typeof state.settings === 'object' ? state.settings : {})
    },
    accounts: {},
    pendingHandoff: null,
    handoffDraft: (state.handoffDraft && typeof state.handoffDraft === 'object') ? state.handoffDraft : null,
    handoffHistory: Array.isArray(state.handoffHistory) ? state.handoffHistory.slice(0, MAX_HISTORY_ITEMS) : []
  };

  if (isPendingHandoffValid(state.pendingHandoff, nowMs)) {
    normalized.pendingHandoff = state.pendingHandoff;
  }

  if (state.accounts && typeof state.accounts === 'object') {
    for (const [email, acc] of Object.entries(state.accounts)) {
      if (!acc || typeof acc !== 'object') continue;
      const base = createEmptyAccountRecord(nowMs);
      normalized.accounts[email] = {
        updatedAt: typeof acc.updatedAt === 'number' ? acc.updatedAt : nowMs,
        channels: {
          [CHANNELS.GEMINI_WEB]: {
            ...base.channels[CHANNELS.GEMINI_WEB],
            ...(acc.channels && acc.channels[CHANNELS.GEMINI_WEB])
          },
          [CHANNELS.AI_STUDIO]: {
            ...base.channels[CHANNELS.AI_STUDIO],
            ...(acc.channels && acc.channels[CHANNELS.AI_STUDIO])
          },
          [CHANNELS.ANTIGRAVITY]: {
            ...base.channels[CHANNELS.ANTIGRAVITY],
            ...(acc.channels && acc.channels[CHANNELS.ANTIGRAVITY])
          }
        }
      };
    }
  }

  if (Object.keys(normalized.accounts).length === 0) {
    normalized.accounts[normalized.activeEmail] = createEmptyAccountRecord(nowMs);
  }

  return normalized;
}

export function ensureAccount(state, email, nowMs = Date.now()) {
  const normState = normalizeState(state, nowMs);
  const accountKey = (typeof email === 'string' && email.trim()) ? email.trim() : normState.activeEmail || DEFAULT_ACCOUNT_KEY;

  if (!normState.accounts[accountKey]) {
    normState.accounts[accountKey] = createEmptyAccountRecord(nowMs);
  }

  return { state: normState, accountKey };
}

export function updateChannelStatus(state, {
  email,
  channel,
  status,
  resetAt = null,
  source = 'auto',
  proBadgeSeen,
  billingRisk,
  lastSignal = null
}, nowMs = Date.now()) {
  const { state: nextState, accountKey } = ensureAccount(state, email, nowMs);
  const acc = nextState.accounts[accountKey];
  acc.updatedAt = nowMs;

  const validChannels = [CHANNELS.GEMINI_WEB, CHANNELS.AI_STUDIO, CHANNELS.ANTIGRAVITY];
  if (!validChannels.includes(channel)) {
    return nextState;
  }

  const chObj = acc.channels[channel] || {};
  const hasActiveCooldown =
    chObj.status === CHANNEL_STATUS.COOLDOWN &&
    typeof chObj.resetAt === 'number' &&
    Number.isFinite(chObj.resetAt) &&
    chObj.resetAt > nowMs;

  const preserveCooldown = hasActiveCooldown && source === 'auto' && status === CHANNEL_STATUS.READY;

  if (!preserveCooldown) {
    chObj.status = status;
    chObj.source = source;
    chObj.resetAt = (typeof resetAt === 'number' && Number.isFinite(resetAt) && resetAt > 0) ? resetAt : null;
  }

  if (lastSignal !== undefined) {
    chObj.lastSignal = lastSignal;
  }
  if (proBadgeSeen !== undefined) {
    chObj.proBadgeSeen = Boolean(proBadgeSeen);
  }
  if (billingRisk !== undefined) {
    chObj.billingRisk = Boolean(billingRisk);
  }
  if (channel === CHANNELS.AI_STUDIO) {
    chObj.lastCheckedAt = nowMs;
  }

  acc.channels[channel] = chObj;
  return nextState;
}

export function refreshExpiredCooldowns(state, nowMs = Date.now()) {
  const nextState = normalizeState(state, nowMs);
  const expiredKeys = [];

  for (const [email, acc] of Object.entries(nextState.accounts)) {
    for (const [ch, data] of Object.entries(acc.channels)) {
      if (data.status === CHANNEL_STATUS.COOLDOWN) {
        const isNumeric = typeof data.resetAt === 'number' && Number.isFinite(data.resetAt) && data.resetAt > 0;
        if (!isNumeric || nowMs >= data.resetAt) {
          data.status = CHANNEL_STATUS.READY;
          data.resetAt = null;
          expiredKeys.push({ email, channel: ch });
        }
      }
    }
  }

  return { state: nextState, expiredKeys };
}

export function appendHandoffHistory(state, draft) {
  const nextState = normalizeState(state);
  if (!draft || typeof draft !== 'object') {
    return nextState;
  }

  const existing = nextState.handoffHistory || [];
  nextState.handoffDraft = draft;
  nextState.handoffHistory = [draft, ...existing.filter((h) => h && h.id !== draft.id)].slice(0, MAX_HISTORY_ITEMS);

  return nextState;
}

export function createPendingHandoff({ target = CHANNELS.AI_STUDIO, markdown, systemPrompt = '', sourceEmail = DEFAULT_ACCOUNT_KEY }, nowMs = Date.now()) {
  return {
    target,
    markdown: (markdown || '').trim(),
    systemPrompt: (systemPrompt || '').trim(),
    sourceEmail,
    createdAt: nowMs,
    expiresAt: nowMs + PENDING_HANDOFF_TTL_MS
  };
}

export function isPendingHandoffValid(pending, nowMs = Date.now()) {
  if (!pending || typeof pending !== 'object') {
    return false;
  }
  if (typeof pending.expiresAt !== 'number' || !Number.isFinite(pending.expiresAt)) {
    return false;
  }
  if (!pending.markdown || typeof pending.markdown !== 'string') {
    return false;
  }
  return nowMs < pending.expiresAt;
}
