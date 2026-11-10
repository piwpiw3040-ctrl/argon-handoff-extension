// Phase-2 Extension Hook for Antigravity Channel Provider

let activeCustomProvider = null;

export function createDefaultAntigravityStatus() {
  return {
    status: 'unknown',
    phase2Hook: true,
    note: 'Track manually until Phase 2 Local Bridge'
  };
}

export function registerAntigravityProvider(provider) {
  if (provider && typeof provider.getStatus === 'function') {
    activeCustomProvider = provider;
  } else {
    activeCustomProvider = null;
  }
}

export async function queryAntigravityStatus(email) {
  if (activeCustomProvider) {
    try {
      const res = await activeCustomProvider.getStatus(email);
      return {
        status: res.status || 'unknown',
        phase2Hook: true,
        ...res
      };
    } catch (err) {
      return {
        status: 'unknown',
        phase2Hook: true,
        error: String(err && err.message ? err.message : err)
      };
    }
  }
  return createDefaultAntigravityStatus();
}
