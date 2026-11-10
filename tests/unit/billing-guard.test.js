import { describe, it, assertEqual, assert } from '../test-harness.js';
import { evaluateBillingGuard, BILLING_REASONS } from '../../shared/billing-guard.js';
import { validateAdapterContract, extractMessageMarkdown, setComposerValue } from '../../content/adapter-contract.js';

describe('billing-guard', () => {
  it('allows auto-inject only when PRO badge is present and no billing risk is detected', () => {
    const res = evaluateBillingGuard({ proBadgePresent: true, billingRiskDetected: false });
    assertEqual(res.allowAutoInject, true);
    assertEqual(res.action, 'AUTO_INJECT');
    assertEqual(res.reasonCode, BILLING_REASONS.SAFE_PRO_PLAYGROUND);
    assertEqual(res.channelStatus, 'ready');
  });

  it('blocks auto-inject with NO_PRO_BADGE when PRO badge is missing', () => {
    const res = evaluateBillingGuard({ proBadgePresent: false, billingRiskDetected: false });
    assertEqual(res.allowAutoInject, false);
    assertEqual(res.action, 'HOLD_AND_WARN');
    assertEqual(res.reasonCode, BILLING_REASONS.NO_PRO_BADGE);
    assertEqual(res.channelStatus, 'billing_risk');
  });

  it('blocks auto-inject with BILLING_PROMPT_DETECTED even if PRO badge is present', () => {
    const res = evaluateBillingGuard({ proBadgePresent: true, billingRiskDetected: true });
    assertEqual(res.allowAutoInject, false);
    assertEqual(res.action, 'HOLD_AND_WARN');
    assertEqual(res.reasonCode, BILLING_REASONS.BILLING_PROMPT_DETECTED);
    assertEqual(res.channelStatus, 'billing_risk');
  });

  it('extracts fenced code blocks and sets composer values via adapter-contract helpers', () => {
    const doc = new DOMParser().parseFromString(
      '<div><p>Hello</p><pre><code class="language-python">print(1)</code></pre><textarea id="t"></textarea></div>',
      'text/html'
    );
    const md = extractMessageMarkdown(doc.querySelector('div'));
    assert(md.includes('```python\nprint(1)\n```'), 'formats pre/code as fenced block');
    const ok = setComposerValue(doc.querySelector('#t'), 'test prompt');
    assertEqual(ok, true);
    assertEqual(doc.querySelector('#t').value, 'test prompt');
    assertEqual(validateAdapterContract({}), false);
  });

  it('escapes nested triple-backtick code fences using 4-backtick outer fence in extractMessageMarkdown', () => {
    const doc = new DOMParser().parseFromString(
      '<div><pre><code class="language-markdown">## Title\n```js\nconsole.log(1);\n```</code></pre></div>',
      'text/html'
    );
    const md = extractMessageMarkdown(doc.querySelector('div'));
    assert(md.includes('````markdown\n## Title\n```js\nconsole.log(1);\n```\n````'), 'uses 4-backtick outer fence when code contains triple backticks');
  });
});
