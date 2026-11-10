// Lightweight zero-dependency assert and test runner for browser ES modules
const suites = [];

export function describe(suiteName, fn) {
  suites.push({ name: suiteName, fn });
}

const currentTests = [];
export function it(testName, fn) {
  currentTests.push({ name: testName, fn });
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    const detail = message ? ` (${message})` : '';
    throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}${detail}`);
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    const detail = message ? ` (${message})` : '';
    throw new Error(`Deep equality mismatch: expected ${expectedStr} but got ${actualStr}${detail}`);
  }
}

export async function runAllSuites(filter = '') {
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const suite of suites) {
    if (filter && !suite.name.toLowerCase().includes(filter.toLowerCase())) {
      continue;
    }
    currentTests.length = 0;
    try {
      suite.fn();
    } catch (err) {
      failed++;
      results.push({ suite: suite.name, name: '[suite-setup]', ok: false, error: String(err && err.stack ? err.stack : err) });
      continue;
    }

    const testsToRun = [...currentTests];
    for (const test of testsToRun) {
      try {
        await test.fn();
        passed++;
        results.push({ suite: suite.name, name: test.name, ok: true });
      } catch (err) {
        failed++;
        results.push({ suite: suite.name, name: test.name, ok: false, error: String(err && err.stack ? err.stack : err) });
      }
    }
  }

  return { passed, failed, results };
}
