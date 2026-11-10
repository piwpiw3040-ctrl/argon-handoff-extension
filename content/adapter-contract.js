export function queryFirst(root, selectors) {
  if (!root || typeof root.querySelector !== 'function') return null;
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (e) {
      // Ignore invalid or unsupported CSS selectors
    }
  }
  return null;
}

export function queryAll(root, selectors) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const found = [];
  for (const sel of selectors) {
    try {
      const nodes = root.querySelectorAll(sel);
      for (const node of nodes) {
        if (!found.includes(node)) {
          found.push(node);
        }
      }
    } catch (e) {
      // Ignore selector errors
    }
  }
  return found;
}

export function queryTopLevelTurns(root, selectors) {
  const all = queryAll(root, selectors);
  if (all.length <= 1) return all;

  // Filter out any element that is nested inside another matched element
  const topLevel = all.filter(
    (node) => !all.some((other) => other !== node && typeof other.contains === 'function' && other.contains(node))
  );

  // Sort in chronological DOM document order
  topLevel.sort((a, b) => {
    if (typeof a.compareDocumentPosition !== 'function') return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & 4) return -1; // Node.DOCUMENT_POSITION_FOLLOWING
    if (pos & 2) return 1;  // Node.DOCUMENT_POSITION_PRECEDING
    return 0;
  });

  return topLevel;
}

export function extractMessageMarkdown(containerEl) {
  if (!containerEl) return '';
  const ownerDoc = containerEl.ownerDocument || document;
  const clone = containerEl.cloneNode(true);

  // Transform pre/code blocks into markdown code fences (dynamically escaped for nested backticks)
  const preElements = clone.querySelectorAll('pre');
  for (const pre of preElements) {
    const code = pre.querySelector('code') || pre;
    let lang = '';
    const classMatch = (code.className || '').match(/language-([\w-]+)/i);
    if (classMatch) {
      lang = classMatch[1];
    }
    const codeText = (code.textContent || '').replace(/\r\n/g, '\n');
    const backtickMatches = codeText.match(/`+/g) || [];
    const maxBackticks = backtickMatches.reduce((max, cur) => Math.max(max, cur.length), 0);
    const fenceMarker = '`'.repeat(Math.max(3, maxBackticks + 1));
    const fence = `\n${fenceMarker}${lang}\n${codeText}\n${fenceMarker}\n`;
    pre.replaceWith(ownerDoc.createTextNode(fence));
  }

  // Handle block elements
  const blocks = clone.querySelectorAll('p, div, li');
  for (const b of blocks) {
    b.appendChild(ownerDoc.createTextNode('\n'));
  }

  let text = clone.textContent || '';
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

export function setComposerValue(el, text) {
  if (!el) return false;

  const isInputOrTextarea = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  if (isInputOrTextarea) {
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    el.focus();
    el.innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

export function validateAdapterContract(adapter) {
  if (!adapter || typeof adapter !== 'object') return false;
  const requiredMethods = [
    'detectAccountEmail',
    'inspectStatus',
    'extractLatestReply',
    'extractConversation',
    'injectText'
  ];

  for (const m of requiredMethods) {
    if (typeof adapter[m] !== 'function') {
      return false;
    }
  }

  if (typeof adapter.channelId !== 'string') {
    return false;
  }

  return true;
}
