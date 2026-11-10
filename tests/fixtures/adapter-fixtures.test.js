import { describe, it, assertEqual, assert } from '../test-harness.js';
import { geminiAdapter } from '../../content/gemini-adapter.js';
import { aistudioAdapter } from '../../content/aistudio-adapter.js';
import { validateAdapterContract } from '../../content/adapter-contract.js';

async function loadDoc(name) {
  const res = await fetch(`./fixtures/${name}`);
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('adapter-fixtures', () => {
  it('validates both adapters satisfy the shared contract', () => {
    assertEqual(validateAdapterContract(geminiAdapter), true);
    assertEqual(validateAdapterContract(aistudioAdapter), true);
  });

  it('gemini-normal: detects email, Argon model, extracts reply/turns, and injects prompt', async () => {
    const doc = await loadDoc('gemini-normal.html');
    assertEqual(geminiAdapter.detectAccountEmail(doc), 'dev@gmail.com');
    const st = geminiAdapter.inspectStatus(doc);
    assertEqual(st.isFlashLiteFallback, false);
    assertEqual(st.isRateLimited, false);
    const reply = geminiAdapter.extractLatestReply(doc);
    assertEqual(reply.ok, true);
    assert(reply.markdown.includes('```js'), 'preserves code block in latest reply');
    const conv = geminiAdapter.extractConversation(doc, 10);
    assertEqual(conv.ok, true);
    assertEqual(conv.turns.length, 4);
    const inj = await geminiAdapter.injectText(doc, { prompt: 'Summarize handoff', autoSend: false });
    assertEqual(inj.ok, true);
  });

  it('gemini-flashlite-locked: detects Flash-Lite fallback & rate-limit while still extracting DOM snapshot', async () => {
    const doc = await loadDoc('gemini-flashlite-locked.html');
    const st = geminiAdapter.inspectStatus(doc);
    assertEqual(st.isFlashLiteFallback, true);
    assertEqual(st.isRateLimited, true);
    const conv = geminiAdapter.extractConversation(doc, 10);
    assertEqual(conv.ok, true);
    assert(conv.turns.length >= 2, 'DOM snapshot works even when locked');
  });

  it('aistudio-pro: detects PRO badge and injects both systemInstructions and prompt without clicking Run', async () => {
    const doc = await loadDoc('aistudio-pro.html');
    assertEqual(aistudioAdapter.detectAccountEmail(doc), 'dev@gmail.com');
    const st = aistudioAdapter.inspectStatus(doc);
    assertEqual(st.proBadgePresent, true);
    assertEqual(st.billingRiskDetected, false);
    const inj = await aistudioAdapter.injectText(doc, {
      prompt: '# Handoff Body',
      systemInstructions: 'Act as Architect',
      autoSend: false
    });
    assertEqual(inj.ok, true);
    assertEqual(inj.injectedFields.includes('prompt'), true);
    assertEqual(inj.injectedFields.includes('systemInstructions'), true);
  });

  it('aistudio-billing-risk: ignores PRO text inside chat turns and flags billing risk', async () => {
    const doc = await loadDoc('aistudio-billing-risk.html');
    const st = aistudioAdapter.inspectStatus(doc);
    assertEqual(st.proBadgePresent, false);
    assertEqual(st.billingRiskDetected, true);
  });

  it('empty DOM: returns structured SELECTOR_NOT_FOUND without throwing', async () => {
    const emptyDoc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    assertEqual(geminiAdapter.extractLatestReply(emptyDoc).reason, 'SELECTOR_NOT_FOUND');
    assertEqual(geminiAdapter.extractConversation(emptyDoc).reason, 'SELECTOR_NOT_FOUND');
    assertEqual((await geminiAdapter.injectText(emptyDoc, { prompt: 'x' })).reason, 'SELECTOR_NOT_FOUND');
    assertEqual((await aistudioAdapter.injectText(emptyDoc, { prompt: 'x' })).reason, 'SELECTOR_NOT_FOUND');
  });
});
