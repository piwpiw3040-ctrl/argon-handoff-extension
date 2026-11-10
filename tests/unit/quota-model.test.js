import { describe, it, assertEqual, assert } from '../test-harness.js';
import {
  normalizeState,
  updateChannelStatus,
  refreshExpiredCooldowns,
  appendHandoffHistory,
  createPendingHandoff,
  isPendingHandoffValid
} from '../../shared/quota-model.js';

describe('quota-model', () => {
  it('normalizes corrupted state and isolates multiple Google accounts', () => {
    let state = normalizeState({ schemaVersion: 999, accounts: 'bad' }, 1000);
    assertEqual(state.schemaVersion, 1);
    state = updateChannelStatus(state, {
      email: 'a@gmail.com',
      channel: 'gemini_web',
      status: 'cooldown',
      resetAt: 61000,
      source: 'auto'
    }, 1000);
    state = updateChannelStatus(state, {
      email: 'b@gmail.com',
      channel: 'gemini_web',
      status: 'ready'
    }, 1000);
    assertEqual(state.accounts['a@gmail.com'].channels.gemini_web.status, 'cooldown');
    assertEqual(state.accounts['b@gmail.com'].channels.gemini_web.status, 'ready');
  });

  it('expires elapsed or malformed cooldowns back to ready', () => {
    let state = normalizeState(null, 1000);
    state = updateChannelStatus(state, {
      email: 'a@gmail.com',
      channel: 'gemini_web',
      status: 'cooldown',
      resetAt: 5000
    }, 1000);
    state.accounts['a@gmail.com'].channels.ai_studio.status = 'cooldown';
    state.accounts['a@gmail.com'].channels.ai_studio.resetAt = 'not-a-number';

    const { state: next, expiredKeys } = refreshExpiredCooldowns(state, 6000);
    assertEqual(next.accounts['a@gmail.com'].channels.gemini_web.status, 'ready');
    assertEqual(next.accounts['a@gmail.com'].channels.gemini_web.resetAt, null);
    assertEqual(next.accounts['a@gmail.com'].channels.ai_studio.status, 'ready');
    assertEqual(expiredKeys.length, 2);
  });

  it('caps handoffHistory at 15 items with FIFO eviction', () => {
    let state = normalizeState(null, 1000);
    for (let i = 1; i <= 18; i++) {
      state = appendHandoffHistory(state, { id: `h-${i}`, markdown: `# ${i}`, createdAt: i });
    }
    assertEqual(state.handoffHistory.length, 15);
    assertEqual(state.handoffHistory[0].id, 'h-18');
    assertEqual(state.handoffHistory[14].id, 'h-4');
  });

  it('enforces 5-minute TTL on pendingHandoff and rejects invalid expiresAt', () => {
    const pending = createPendingHandoff({ markdown: '# Test' }, 10000);
    assertEqual(pending.expiresAt, 310000);
    assertEqual(isPendingHandoffValid(pending, 309999), true);
    assertEqual(isPendingHandoffValid(pending, 310001), false);
    assertEqual(isPendingHandoffValid({ markdown: '# Test', expiresAt: NaN }, 10000), false);
  });
});
