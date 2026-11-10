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
      bottom: 84px; /* Floats above bottom composer bar so it never blocks Run/Send buttons */
      right: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 6px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 30px;
      padding: 6px 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      color: #c9d1d9;
      user-select: none;
    }
    .drag-handle {
      cursor: grab;
      color: #8b949e;
      font-size: 14px;
      padding: 0 4px;
      line-height: 1;
    }
    .drag-handle:active {
      cursor: grabbing;
    }
    .pill-body {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .minimized .pill-body {
      display: none;
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
      padding: 4px 9px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
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
    .btn-toggle {
      background: none;
      border: none;
      color: #8b949e;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 10px;
      line-height: 1;
    }
    .btn-toggle:hover {
      color: #f0f6fc;
      background: #30363d;
    }
    .mini-label {
      display: none;
      font-size: 11px;
      font-weight: 600;
      color: #58a6ff;
      cursor: pointer;
      padding: 2px 4px;
    }
    .minimized .mini-label {
      display: inline-block;
    }
  `;

  const container = doc.createElement('div');
  container.className = 'pill-container';

  // Drag handle
  const dragHandle = doc.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Drag to reposition';
  dragHandle.textContent = '⠿';

  // Mini label shown when minimized
  const miniLabel = doc.createElement('span');
  miniLabel.className = 'mini-label';
  miniLabel.textContent = '🚀 Argon Handoff';
  miniLabel.onclick = () => toggleMinimize(false);

  // Body container that collapses when minimized
  const body = doc.createElement('div');
  body.className = 'pill-body';

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

  body.appendChild(badgeEl);
  body.appendChild(btnPrompt);
  body.appendChild(btnSnapshot);
  body.appendChild(btnConfirmInject);
  body.appendChild(btnSidePanel);

  // Minimize button
  const btnToggle = doc.createElement('button');
  btnToggle.className = 'btn-toggle';
  btnToggle.title = 'Minimize / Expand';
  btnToggle.textContent = '─';
  btnToggle.onclick = (e) => {
    e.stopPropagation();
    toggleMinimize();
  };

  function toggleMinimize(forceState) {
    const isMin = forceState !== undefined ? forceState : !container.classList.contains('minimized');
    if (isMin) {
      container.classList.add('minimized');
      btnToggle.textContent = '▲';
    } else {
      container.classList.remove('minimized');
      btnToggle.textContent = '─';
    }
  }

  // Draggable support
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;

  dragHandle.onmousedown = (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = container.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    container.style.bottom = 'auto';
    container.style.right = 'auto';
    container.style.left = `${initLeft}px`;
    container.style.top = `${initTop}px`;

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const maxLeft = (window.innerWidth || doc.documentElement.clientWidth) - container.offsetWidth - 10;
      const maxTop = (window.innerHeight || doc.documentElement.clientHeight) - container.offsetHeight - 10;
      const newLeft = Math.max(10, Math.min(maxLeft, initLeft + dx));
      const newTop = Math.max(10, Math.min(maxTop, initTop + dy));
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  container.appendChild(dragHandle);
  container.appendChild(miniLabel);
  container.appendChild(body);
  container.appendChild(btnToggle);

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
