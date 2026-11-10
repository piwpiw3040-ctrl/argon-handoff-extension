export function mountFloatingPill(doc, {
  channelId,
  onPromptHandoff,
  onDomSnapshot,
  onOpenSidePanel,
  onConfirmPendingInject
} = {}) {
  let host = doc.querySelector('#argon-handoff-pill-host');
  if (host) {
    host.remove();
  }

  host = doc.createElement('div');
  host.id = 'argon-handoff-pill-host';
  doc.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = `
    .pill-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 30px;
      padding: 6px 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #c9d1d9;
      user-select: none;
    }
    .badge {
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge.ok { background: #238636; color: #ffffff; }
    .badge.warn { background: #d29922; color: #0d1117; }
    .badge.danger { background: #da3633; color: #ffffff; }
    .btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 4px 10px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn:hover {
      background: #30363d;
      border-color: #8b949e;
      color: #ffffff;
    }
    .btn.primary {
      background: #1f6feb;
      border-color: #388bfd;
      color: #ffffff;
    }
    .btn.primary:hover {
      background: #388bfd;
    }
    .btn.danger-action {
      background: #da3633;
      border-color: #f85149;
      color: #ffffff;
    }
  `;

  const container = doc.createElement('div');
  container.className = 'pill-container';

  const badgeEl = doc.createElement('span');
  badgeEl.className = 'badge ok';
  badgeEl.textContent = 'Argon Ready';

  const btnPrompt = doc.createElement('button');
  btnPrompt.className = 'btn';
  btnPrompt.textContent = 'Prompt Handoff';
  btnPrompt.onclick = () => onPromptHandoff && onPromptHandoff();

  const btnSnapshot = doc.createElement('button');
  btnSnapshot.className = 'btn';
  btnSnapshot.textContent = 'DOM Snapshot (.md)';
  btnSnapshot.onclick = () => onDomSnapshot && onDomSnapshot();

  const btnSidePanel = doc.createElement('button');
  btnSidePanel.className = 'btn primary';
  btnSidePanel.textContent = 'Side Panel';
  btnSidePanel.onclick = () => onOpenSidePanel && onOpenSidePanel();

  const btnConfirmInject = doc.createElement('button');
  btnConfirmInject.className = 'btn danger-action';
  btnConfirmInject.textContent = 'Confirm Inject Anyway';
  btnConfirmInject.style.display = 'none';
  btnConfirmInject.onclick = () => onConfirmPendingInject && onConfirmPendingInject();

  container.appendChild(badgeEl);
  container.appendChild(btnPrompt);
  container.appendChild(btnSnapshot);
  container.appendChild(btnConfirmInject);
  container.appendChild(btnSidePanel);

  shadow.appendChild(style);
  shadow.appendChild(container);

  return {
    updateBadge({ label = 'Argon Ready', tone = 'ok', showConfirmInject = false } = {}) {
      badgeEl.className = `badge ${tone}`;
      badgeEl.textContent = label;
      btnConfirmInject.style.display = showConfirmInject ? 'inline-block' : 'none';
    },
    destroy() {
      if (host && host.parentNode) {
        host.remove();
      }
    }
  };
}
