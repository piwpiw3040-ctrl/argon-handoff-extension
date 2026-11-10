import { describe, it, assertEqual } from '../test-harness.js';
import {
  registerAntigravityProvider,
  queryAntigravityStatus
} from '../../shared/channel-provider.js';

describe('channel-provider', () => {
  it('returns default unknown stub status when no Phase 2 provider is registered', async () => {
    registerAntigravityProvider(null);
    const res = await queryAntigravityStatus('dev@gmail.com');
    assertEqual(res.status, 'unknown');
    assertEqual(res.phase2Hook, true);
  });

  it('delegates to registered custom provider for Phase 2 extension', async () => {
    registerAntigravityProvider({
      async getStatus(email) {
        return { status: 'ready', phase2Hook: true, account: email };
      }
    });
    const res = await queryAntigravityStatus('pro@gmail.com');
    assertEqual(res.status, 'ready');
    assertEqual(res.account, 'pro@gmail.com');
    registerAntigravityProvider(null);
  });
});
