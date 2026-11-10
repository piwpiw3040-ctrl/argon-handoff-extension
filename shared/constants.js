// System-wide constants and invariants for Argon Cross-Channel Handoff Extension

export const SCHEMA_VERSION = 1;
export const DEFAULT_ACCOUNT_KEY = 'default-profile';
export const MAX_HISTORY_ITEMS = 15;
export const PENDING_HANDOFF_TTL_MS = 300000; // 5 minutes
export const COMPOSER_TIMEOUT_MS = 15000;    // 15 seconds

export const DEFAULT_SETTINGS = Object.freeze({
  autoSendHandoffPrompt: false,
  snapshotMaxTurns: 12,
  defaultCooldownMinutes: 60,
  customHandoffPrompt: null
});

export const CHANNELS = Object.freeze({
  GEMINI_WEB: 'gemini_web',
  AI_STUDIO: 'ai_studio',
  ANTIGRAVITY: 'antigravity'
});

export const CHANNEL_STATUS = Object.freeze({
  READY: 'ready',
  COOLDOWN: 'cooldown',
  DEGRADED_FLASH_LITE: 'degraded_flash_lite',
  BILLING_RISK: 'billing_risk',
  UNKNOWN: 'unknown'
});

export const MESSAGE_TYPES = Object.freeze({
  CAPTURE_HANDOFF: 'CAPTURE_HANDOFF',
  INJECT_HANDOFF_PROMPT: 'INJECT_HANDOFF_PROMPT',
  PREPARE_AISTUDIO_HANDOFF: 'PREPARE_AISTUDIO_HANDOFF',
  EXPORT_ANTIGRAVITY_MD: 'EXPORT_ANTIGRAVITY_MD',
  UPDATE_CHANNEL_STATUS: 'UPDATE_CHANNEL_STATUS',
  REPORT_PAGE_STATUS: 'REPORT_PAGE_STATUS',
  CONSUME_PENDING_HANDOFF: 'CONSUME_PENDING_HANDOFF',
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL'
});
