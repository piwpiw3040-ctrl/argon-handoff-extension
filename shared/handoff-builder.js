import { CHANNELS } from './constants.js';

export const DEFAULT_HANDOFF_PROMPT = `Please summarize our conversation into a structured Markdown handoff document using exactly these sections:

## Objective
[What we set out to build or solve]

## Current State & Key Decisions
[What is currently implemented, architecture choices made, and technical constraints]

## Files & Code Context
[Key files touched or relevant code snippets]

## Open Issues / Constraints
[Remaining bugs, edge cases, quota issues, or blocker details]

## Next Immediate Action
[Concrete next step for the next model to execute]`;

export function getHandoffSummaryPrompt(customPrompt) {
  if (typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
    return customPrompt.trim();
  }
  return DEFAULT_HANDOFF_PROMPT;
}

export function sanitizeSlug(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return 'session';
  }

  let s = rawTitle.toLowerCase().trim();
  // Replace Windows-forbidden path characters and control whitespace
  s = s.replace(/[<>:"/\\|?*\s]+/g, '-');
  // Strip everything that is not a Unicode letter, mark, number, or dash
  s = s.replace(/[^\p{L}\p{M}\p{N}-]+/gu, '-');
  // Collapse repeated dashes
  s = s.replace(/-{2,}/g, '-');
  // Trim dashes from start and end
  s = s.replace(/^-+|-+$/g, '');

  if (s.length > 40) {
    s = s.slice(0, 40).replace(/-+$/, '');
  }

  if (!s || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) {
    return 'session';
  }

  return s;
}

export function formatTimestampCompact(epochMs = Date.now()) {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}${month}${day}-${hours}${mins}`;
}

export function formatDomTranscript(turns, maxTurns = 12) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return { ok: false, reason: 'EMPTY_TURNS' };
  }

  const selectedTurns = turns.slice(-maxTurns);
  const parts = [];

  for (let i = 0; i < selectedTurns.length; i++) {
    const turn = selectedTurns[i];
    const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
    const content = (turn.content || '').trim();
    parts.push(`### Turn ${i + 1} — ${roleLabel}\n\n${content}`);
  }

  return {
    ok: true,
    markdown: parts.join('\n\n')
  };
}

export function buildHandoffMarkdown({
  sourceChannel = CHANNELS.GEMINI_WEB,
  accountEmail = 'default-profile',
  mode = 'dom_snapshot',
  title = 'Session Handoff',
  bodyMarkdown = '',
  modelStatus = 'ready',
  capturedAt = Date.now()
}) {
  const dateIso = new Date(capturedAt).toISOString();
  const header = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `sourceChannel: ${sourceChannel}`,
    `accountEmail: ${accountEmail}`,
    `mode: ${mode}`,
    `modelStatus: ${modelStatus}`,
    `capturedAt: ${dateIso}`,
    '---',
    ''
  ].join('\n');

  return `${header}\n# ${title}\n\n${bodyMarkdown.trim()}\n`;
}

export function buildAntigravityExport({ markdown, title = 'handoff', capturedAt = Date.now() }) {
  const slug = sanitizeSlug(title);
  const stamp = formatTimestampCompact(capturedAt);
  const fileName = `handoff-${stamp}-${slug}.md`;
  const filePath = `argon-handoffs/${fileName}`;

  const continuationPrompt = `@${fileName} อ่านบริบทงานล่าสุดจากไฟล์นี้ และดำเนินการต่อในขั้นตอนถัดไปทันที`;

  return {
    fileName,
    filePath,
    continuationPrompt
  };
}
