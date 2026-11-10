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
      background: rgba(10, 11, 16, 0.82);
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 9999px;
      padding: 6px 12px;
      box-shadow: 
        inset 0 1px 0 rgba(255, 255, 255, 0.22),
        0 16px 40px rgba(0, 0, 0, 0.65),
        0 2px 8px rgba(0, 0, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
      font-size: 12px;
      color: rgba(235, 235, 245, 0.85);
      user-select: none;
      -webkit-font-smoothing: antialiased;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pill-container:hover {
      border-color: rgba(255, 255, 255, 0.26);
      box-shadow: 
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        0 20px 48px rgba(0, 0, 0, 0.72);
    }
    .drag-handle {
      cursor: grab;
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
      padding: 0 4px;
      line-height: 1;
      transition: color 0.15s;
    }
    .drag-handle:hover {
      color: #ffffff;
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
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 9999px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .badge.ok { 
      background: rgba(48, 209, 88, 0.18); 
      color: #30d158; 
      border-color: rgba(48, 209, 88, 0.38);
      box-shadow: 0 0 10px rgba(48, 209, 88, 0.25);
    }
    .badge.warn { 
      background: rgba(255, 159, 10, 0.18); 
      color: #ff9f0a; 
      border-color: rgba(255, 159, 10, 0.38);
      box-shadow: 0 0 10px rgba(255, 159, 10, 0.25);
    }
    .badge.danger { 
      background: rgba(255, 69, 58, 0.18); 
      color: #ff453a; 
      border-color: rgba(255, 69, 58, 0.38);
      box-shadow: 0 0 10px rgba(255, 69, 58, 0.25);
    }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #f5f5f7;
      padding: 4px 11px;
      border-radius: 9999px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: -0.01em;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.16);
      border-color: rgba(255, 255, 255, 0.25);
      color: #ffffff;
    }
    .btn:active {
      transform: scale(0.96);
    }
    .btn.primary {
      background: linear-gradient(180deg, #1d8fff 0%, #0066d6 100%);
      border: 1px solid rgba(255, 255, 255, 0.25);
      box-shadow: 
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 2px 10px rgba(10, 132, 255, 0.35);
      color: #ffffff;
      font-weight: 600;
    }
    .btn.primary:hover {
      background: linear-gradient(180deg, #2f99ff 0%, #0a73e6 100%);
      box-shadow: 
        inset 0 1px 0 rgba(255, 255, 255, 0.45),
        0 4px 14px rgba(10, 132, 255, 0.5);
    }
    .btn.danger-action {
      background: linear-gradient(180deg, #ff453a 0%, #d70015 100%);
      border: 1px solid rgba(255, 255, 255, 0.25);
      box-shadow: 
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 2px 10px rgba(255, 69, 58, 0.35);
      color: #ffffff;
      font-weight: 600;
    }
    .btn-toggle {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      font-size: 11px;
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: all 0.15s;
    }
    .btn-toggle:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.18);
      border-color: rgba(255, 255, 255, 0.22);
    }
    .mini-label {
      display: none;
      font-size: 11px;
      font-weight: 600;
      color: #0a84ff;
      cursor: pointer;
      padding: 2px 6px;
      letter-spacing: -0.01em;
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
