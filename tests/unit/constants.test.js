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
