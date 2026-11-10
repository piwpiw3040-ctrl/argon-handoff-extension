import { describe, it, assertEqual, assert } from '../test-harness.js';
import {
  getHandoffSummaryPrompt,
  sanitizeSlug,
  formatDomTranscript,
  buildHandoffMarkdown,
  buildAntigravityExport
} from '../../shared/handoff-builder.js';

describe('handoff-builder', () => {
  it('sanitizes slugs with Thai/Unicode, forbidden Windows chars, and reserved names', () => {
    assertEqual(sanitizeSlug('Auth Refactor: Step 1/2?'), 'auth-refactor-step-1-2');
    assertEqual(sanitizeSlug('แก้บั๊ก โควต้า <Argon>'), 'แก้บั๊ก-โควต้า-argon');
    assertEqual(sanitizeSlug('CON'), 'session');
    assertEqual(sanitizeSlug('   ***   '), 'session');
    assertEqual(sanitizeSlug('a'.repeat(60)).length, 40);
  });

  it('preserves nested triple-backtick code blocks in formatDomTranscript', () => {
    const turns = [
      { role: 'user', content: 'Fix this snippet:\n```js\nconst x = 1;\n```' },
      { role: 'assistant', content: 'Updated:\n```js\nconst x = 2;\n```' }
    ];
    const res = formatDomTranscript(turns, 12);
    assertEqual(res.ok, true);
    assert(res.markdown.includes('```js\nconst x = 1;\n```'), 'must keep user code fence');
    assert(res.markdown.includes('```js\nconst x = 2;\n```'), 'must keep assistant code fence');
  });

  it('rejects empty turns array in formatDomTranscript', () => {
    const res = formatDomTranscript([], 12);
    assertEqual(res.ok, false);
    assertEqual(res.reason, 'EMPTY_TURNS');
  });

  it('builds deterministic Antigravity export path and continuation prompt', () => {
    const ts = new Date(2026, 10, 10, 21, 5, 0).getTime(); // 2026-11-10 21:05
    const md = buildHandoffMarkdown({
      sourceChannel: 'gemini_web',
      accountEmail: 'dev@gmail.com',
      mode: 'dom_snapshot',
      title: 'Auth Flow',
      bodyMarkdown: '## Objective\nShip it',
      modelStatus: 'degraded_flash_lite',
      capturedAt: ts
    });
    assert(md.includes('sourceChannel: gemini_web'), 'header metadata');
    const exp = buildAntigravityExport({ markdown: md, title: 'Auth Flow', capturedAt: ts });
    assertEqual(exp.fileName, 'handoff-20261110-2105-auth-flow.md');
    assertEqual(exp.filePath, 'argon-handoffs/handoff-20261110-2105-auth-flow.md');
    assert(exp.continuationPrompt.includes('handoff-20261110-2105-auth-flow.md'), 'prompt references filename');
  });

  it('returns custom prompt when non-empty and falls back to default otherwise', () => {
    assert(getHandoffSummaryPrompt(null).includes('## Objective'), 'default prompt');
    assertEqual(getHandoffSummaryPrompt('  Custom Summary  '), 'Custom Summary');
  });
});
