// Content Script Loader for Manifest V3 (Dynamic ES Module Import inside Isolated World)

(async () => {
  try {
    const isGemini = window.location.hostname.includes('gemini.google.com');
    const isAIStudio = window.location.hostname.includes('aistudio.google.com');

    if (!isGemini && !isAIStudio) return;

    const { MESSAGE_TYPES, CHANNELS, COMPOSER_TIMEOUT_MS } = await import(chrome.runtime.getURL('shared/constants.js'));
    const { evaluateBillingGuard } = await import(chrome.runtime.getURL('shared/billing-guard.js'));
    const { getHandoffSummaryPrompt, formatDomTranscript, buildHandoffMarkdown } = await import(chrome.runtime.getURL('shared/handoff-builder.js'));
    const { mountFloatingPill } = await import(chrome.runtime.getURL('content/floating-pill.js'));

    const adapterModule = isGemini
      ? await import(chrome.runtime.getURL('content/gemini-adapter.js'))
      : await import(chrome.runtime.getURL('content/aistudio-adapter.js'));

    const adapter = isGemini ? adapterModule.geminiAdapter : adapterModule.aistudioAdapter;

    let pendingHandoffPayload = null;

    async function reportStatus() {
      const email = adapter.detectAccountEmail(document);
      const st = adapter.inspectStatus(document);
      const guard = isAIStudio ? evaluateBillingGuard(st) : null;

      const payload = {
        type: MESSAGE_TYPES.REPORT_PAGE_STATUS,
        channelId: adapter.channelId,
        email: email || 'default-profile',
        ...st,
        channelStatus: guard ? guard.channelStatus : (st.isFlashLiteFallback ? 'degraded_flash_lite' : 'ready')
      };

      try {
        await chrome.runtime.sendMessage(payload);
      } catch (e) {}

      if (pill) {
        if (isAIStudio && guard && guard.action === 'HOLD_AND_WARN') {
          pill.updateBadge({ label: guard.reasonCode, tone: 'danger', showConfirmInject: Boolean(pendingHandoffPayload) });
        } else if (isGemini && st.isFlashLiteFallback) {
          pill.updateBadge({ label: 'Flash-Lite Locked', tone: 'warn' });
        } else {
          pill.updateBadge({ label: 'Argon Ready', tone: 'ok' });
        }
      }
    }

    async function handlePromptHandoff() {
      const prompt = getHandoffSummaryPrompt(null);
      await adapter.injectText(document, { prompt, autoSend: false });
    }

    async function handleDomSnapshot() {
      let turnsRes = adapter.extractConversation(document, 12);

      // Fallback 1: if user highlighted/selected text on page
      if (!turnsRes || !turnsRes.ok || !turnsRes.turns || turnsRes.turns.length === 0) {
        const selectionText = (window.getSelection ? window.getSelection().toString() : '').trim();
        if (selectionText && selectionText.length > 10) {
          turnsRes = {
            ok: true,
            turns: [{ role: 'assistant', content: selectionText }]
          };
        }
      }

      // Fallback 2: read from main conversation container directly
      if (!turnsRes || !turnsRes.ok || !turnsRes.turns || turnsRes.turns.length === 0) {
        const mainEl = document.querySelector('main, [role="main"], infinite-scroller, .conversation-container, #chat-history');
        if (mainEl) {
          const rawText = (mainEl.innerText || '').trim();
          if (rawText.length > 20) {
            turnsRes = {
              ok: true,
              turns: [{ role: 'assistant', content: rawText }]
            };
          }
        }
      }

      if (!turnsRes || !turnsRes.ok || !turnsRes.turns || turnsRes.turns.length === 0) {
        alert('Could not locate conversation turns: ' + ((turnsRes && turnsRes.reason) || 'SELECTOR_NOT_FOUND') + '\n\n💡 ทริค: คุณสามารถลากคลุมดำ (Highlight) ข้อความแชทบนหน้าจอ แล้วกดปุ่ม DOM Snapshot อีกครั้งได้ทันทีครับ');
        return;
      }

      const formatted = formatDomTranscript(turnsRes.turns, 12);
      const email = adapter.detectAccountEmail(document) || 'default-profile';
      const st = adapter.inspectStatus(document);
      const markdown = buildHandoffMarkdown({
        sourceChannel: adapter.channelId,
        accountEmail: email,
        mode: 'dom_snapshot',
        title: 'Session Handoff',
        bodyMarkdown: formatted.markdown,
        modelStatus: st.isFlashLiteFallback ? 'degraded_flash_lite' : 'ready'
      });

      const draft = {
        id: 'draft-' + Date.now(),
        sourceChannel: adapter.channelId,
        accountEmail: email,
        mode: 'dom_snapshot',
        titleSlug: 'session',
        markdown,
        createdAt: Date.now()
      };

      try {
        await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CAPTURE_HANDOFF, draft });
        await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDE_PANEL });
      } catch (e) {
        chrome.storage.local.set({ handoffDraft: draft });
      }
    }

    async function handleConfirmPendingInject() {
      if (!pendingHandoffPayload) return;
      const inj = await adapter.injectText(document, {
        prompt: pendingHandoffPayload.markdown,
        systemInstructions: pendingHandoffPayload.systemPrompt || '',
        autoSend: false
      });
      if (inj.ok) {
        pendingHandoffPayload = null;
        if (pill) {
          pill.updateBadge({ label: 'Injected (Review First)', tone: 'ok', showConfirmInject: false });
        }
      }
    }

    const pill = mountFloatingPill(document, {
      channelId: adapter.channelId,
      onPromptHandoff: handlePromptHandoff,
      onDomSnapshot: handleDomSnapshot,
      onOpenSidePanel: () => {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDE_PANEL }).catch(() => {});
      },
      onConfirmPendingInject: handleConfirmPendingInject
    });

    // Listen for commands dispatched from Side Panel or Background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return;
      if (msg.type === MESSAGE_TYPES.INJECT_HANDOFF_PROMPT) {
        handlePromptHandoff().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
      if (msg.type === MESSAGE_TYPES.CAPTURE_HANDOFF) {
        handleDomSnapshot().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
    });

    // Check status periodically & on DOM updates
    setTimeout(reportStatus, 1000);
    setInterval(reportStatus, 15000);

    // AI Studio: Consume pending handoff if coming from cross-tab transfer
    if (isAIStudio) {
      try {
        const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CONSUME_PENDING_HANDOFF });
        if (res && res.ok && res.handoff) {
          pendingHandoffPayload = res.handoff;

          const startTime = Date.now();
          const checkReady = async () => {
            const st = adapter.inspectStatus(document);
            const guard = evaluateBillingGuard(st);

            if (guard.action === 'AUTO_INJECT') {
              const inj = await adapter.injectText(document, {
                prompt: pendingHandoffPayload.markdown,
                systemInstructions: pendingHandoffPayload.systemPrompt || '',
                autoSend: false
              });
              if (inj.ok) {
                pendingHandoffPayload = null;
                reportStatus();
                return;
              }
            } else if (guard.reasonCode === 'BILLING_PROMPT_DETECTED') {
              // Explicit billing risk detected - halt automatic injection immediately
              reportStatus();
              return;
            }

            // If PRO badge is not yet mounted (cold SPA mount) or composer is rendering, continue polling up to timeout
            if (Date.now() - startTime < COMPOSER_TIMEOUT_MS) {
              setTimeout(checkReady, 500);
            } else {
              // Timeout reached - keep payload ready for manual pill action
              reportStatus();
            }
          };

          checkReady();
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('[Argon Handoff Extension] Loader error:', err);
  }
})();
