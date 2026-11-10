import { MESSAGE_TYPES, CHANNELS, CHANNEL_STATUS } from '../shared/constants.js';
import { normalizeState, updateChannelStatus } from '../shared/quota-model.js';

export async function initSidePanelController(rootDoc, bridge) {
  let currentState = await bridge.getState();

  const accountSelector = rootDoc.querySelector('#account-selector');
  const btnAddAccount = rootDoc.querySelector('#btn-add-account');
  const accountEmailInput = rootDoc.querySelector('#account-email-input');

  const billingBanner = rootDoc.querySelector('#billing-guard-banner');
  const billingMsg = rootDoc.querySelector('#billing-guard-message');

  const badgeGemini = rootDoc.querySelector('#badge-gemini-web');
  const cooldownGemini = rootDoc.querySelector('#cooldown-gemini-web');

  const badgeAIStudio = rootDoc.querySelector('#badge-ai-studio');
  const cooldownAIStudio = rootDoc.querySelector('#cooldown-ai-studio');

  const badgeAntigravity = rootDoc.querySelector('#badge-antigravity');
  const cooldownAntigravity = rootDoc.querySelector('#cooldown-antigravity');

  const titleInput = rootDoc.querySelector('#handoff-title-input');
  const systemInput = rootDoc.querySelector('#handoff-system-input');
  const markdownInput = rootDoc.querySelector('#handoff-markdown-input');

  const btnPromptHandoff = rootDoc.querySelector('#btn-prompt-handoff');
  const btnDomSnapshot = rootDoc.querySelector('#btn-dom-snapshot');
  const btnSendAIStudio = rootDoc.querySelector('#btn-send-aistudio');
  const btnExportAntigravity = rootDoc.querySelector('#btn-export-antigravity');

  const fallbackBox = rootDoc.querySelector('#clipboard-fallback-box');
  const fallbackTextarea = rootDoc.querySelector('#clipboard-fallback-textarea');
  const historyList = rootDoc.querySelector('#handoff-history-list');

  function render(state) {
    currentState = normalizeState(state);
    const activeEmail = currentState.activeEmail || 'default-profile';
    const acc = currentState.accounts[activeEmail] || { channels: {} };
    const channels = acc.channels || {};

    // 1. Account Dropdown
    if (accountSelector) {
      accountSelector.innerHTML = '';
      const emails = Object.keys(currentState.accounts);
      for (const e of emails) {
        const opt = rootDoc.createElement('option');
        opt.value = e;
        opt.textContent = e;
        if (e === activeEmail) opt.selected = true;
        accountSelector.appendChild(opt);
      }
    }

    // 2. Channel Cards
    const gCh = channels[CHANNELS.GEMINI_WEB] || {};
    if (badgeGemini) {
      badgeGemini.textContent = (gCh.status || 'ready').toUpperCase();
      badgeGemini.className = `badge ${gCh.status === 'ready' ? 'ok' : (gCh.status === 'cooldown' ? 'warn' : 'danger')}`;
    }
    if (cooldownGemini) {
      if (gCh.status === 'cooldown' && gCh.resetAt) {
        const mins = Math.max(1, Math.round((gCh.resetAt - Date.now()) / 60000));
        cooldownGemini.textContent = `⏳ Cooldown: เหลืออีกประมาณ ${mins} นาที`;
      } else if (gCh.status === 'degraded_flash_lite') {
        cooldownGemini.textContent = '⚠️ ดรอปเหลือ Flash-Lite (Argon เต็มหลอด)';
      } else {
        cooldownGemini.textContent = '✅ โควต้าพร้อมใช้งานเต็มที่';
      }
    }

    const aCh = channels[CHANNELS.AI_STUDIO] || {};
    if (badgeAIStudio) {
      badgeAIStudio.textContent = (aCh.status || 'ready').toUpperCase();
      badgeAIStudio.className = `badge ${aCh.status === 'ready' ? 'ok' : (aCh.status === 'cooldown' ? 'warn' : 'danger')}`;
    }
    if (cooldownAIStudio) {
      if (aCh.status === 'cooldown' && aCh.resetAt) {
        const mins = Math.max(1, Math.round((aCh.resetAt - Date.now()) / 60000));
        cooldownAIStudio.textContent = `⏳ Cooldown: เหลืออีกประมาณ ${mins} นาที`;
      } else if (aCh.status === 'billing_risk') {
        cooldownAIStudio.textContent = '🛑 ระวังค่าใช้จ่าย Billing API';
      } else {
        cooldownAIStudio.textContent = aCh.proBadgeSeen ? '✅ ตรวจเจอป้าย PRO (ปลอดภัย)' : 'Playground Mode';
      }
    }

    const antiCh = channels[CHANNELS.ANTIGRAVITY] || {};
    if (badgeAntigravity) {
      badgeAntigravity.textContent = (antiCh.status || 'ready').toUpperCase();
    }

    // 3. Billing Guard Banner
    if (billingBanner) {
      const isRisk = aCh.status === 'billing_risk' || aCh.billingRisk;
      billingBanner.hidden = !isRisk;
      if (billingMsg && isRisk) {
        billingMsg.textContent = aCh.billingRisk
          ? '⚠️ ตรวจพบคำเตือน Cloud Billing / Pay-as-you-go API บน AI Studio'
          : '⚠️ ไม่พบป้าย [PRO] ที่แถบสถานะ AI Studio — ตรวจสอบบัญชีก่อนยิงงานต่อ';
      }
    }

    // 4. Draft Content
    if (currentState.handoffDraft) {
      if (titleInput && !titleInput.value) {
        titleInput.value = currentState.handoffDraft.titleSlug || '';
      }
      if (markdownInput && !markdownInput.value) {
        markdownInput.value = currentState.handoffDraft.markdown || '';
      }
      if (systemInput && !systemInput.value) {
        systemInput.value = currentState.handoffDraft.systemInstructions || '';
      }
    }

    // 5. History List
    if (historyList) {
      historyList.innerHTML = '';
      const history = currentState.handoffHistory || [];
      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-text">ยังไม่มีประวัติ Handoff ล่าสุด</div>';
      } else {
        for (const item of history) {
          const div = rootDoc.createElement('div');
          div.className = 'history-item';
          const title = item.titleSlug || item.sourceChannel || 'Handoff';
          const time = new Date(item.createdAt || Date.now()).toLocaleTimeString();
          div.innerHTML = `
            <div class="history-item-title">${title} (${item.sourceChannel || 'web'})</div>
            <div class="history-item-sub">${item.accountEmail || ''} • ${time}</div>
          `;
          div.onclick = () => {
            if (titleInput) titleInput.value = item.titleSlug || '';
            if (markdownInput) markdownInput.value = item.markdown || '';
            if (systemInput) systemInput.value = item.systemInstructions || '';
          };
          historyList.appendChild(div);
        }
      }
    }
  }

  // Event handlers
  if (accountSelector) {
    accountSelector.onchange = () => {
      currentState.activeEmail = accountSelector.value;
      render(currentState);
    };
  }

  if (btnAddAccount && accountEmailInput) {
    btnAddAccount.onclick = () => {
      if (accountEmailInput.style.display === 'none') {
        accountEmailInput.style.display = 'block';
        accountEmailInput.focus();
      } else {
        const val = accountEmailInput.value.trim();
        if (val && val.includes('@')) {
          currentState = updateChannelStatus(currentState, {
            email: val,
            channel: CHANNELS.GEMINI_WEB,
            status: CHANNEL_STATUS.READY
          });
          currentState.activeEmail = val;
          accountEmailInput.value = '';
          accountEmailInput.style.display = 'none';
          render(currentState);
        } else {
          accountEmailInput.style.display = 'none';
        }
      }
    };
  }

  // Card Action buttons (Mark Cooldown & Reset)
  const actionButtons = rootDoc.querySelectorAll('.channel-actions button');
  for (const btn of actionButtons) {
    btn.onclick = async () => {
      const channel = btn.getAttribute('data-channel');
      const action = btn.getAttribute('data-action');
      const email = currentState.activeEmail || 'default-profile';

      if (action === 'cooldown') {
        const resetAt = Date.now() + 60 * 60 * 1000;
        await bridge.sendMessage({
          type: MESSAGE_TYPES.UPDATE_CHANNEL_STATUS,
          email,
          channel,
          status: CHANNEL_STATUS.COOLDOWN,
          resetAt,
          source: 'manual'
        });
        currentState = updateChannelStatus(currentState, {
          email,
          channel,
          status: CHANNEL_STATUS.COOLDOWN,
          resetAt,
          source: 'manual'
        });
        render(currentState);
      } else if (action === 'reset') {
        await bridge.sendMessage({
          type: MESSAGE_TYPES.UPDATE_CHANNEL_STATUS,
          email,
          channel,
          status: CHANNEL_STATUS.READY,
          resetAt: null,
          source: 'manual'
        });
        currentState = updateChannelStatus(currentState, {
          email,
          channel,
          status: CHANNEL_STATUS.READY,
          resetAt: null,
          source: 'manual'
        });
        render(currentState);
      }
    };
  }

  if (btnSendAIStudio) {
    btnSendAIStudio.onclick = async () => {
      const markdown = markdownInput ? markdownInput.value : '';
      const systemPrompt = systemInput ? systemInput.value : '';
      const title = titleInput ? titleInput.value : 'handoff';

      const draft = {
        id: 'draft-' + Date.now(),
        sourceChannel: CHANNELS.AI_STUDIO,
        accountEmail: currentState.activeEmail,
        titleSlug: title,
        systemInstructions: systemPrompt,
        markdown,
        createdAt: Date.now()
      };

      await bridge.sendMessage({
        type: MESSAGE_TYPES.PREPARE_AISTUDIO_HANDOFF,
        markdown,
        systemPrompt,
        sourceEmail: currentState.activeEmail,
        draft
      });
    };
  }

  if (btnExportAntigravity) {
    btnExportAntigravity.onclick = async () => {
      const markdown = markdownInput ? markdownInput.value : '';
      const title = titleInput ? titleInput.value : 'handoff';

      const res = await bridge.sendMessage({
        type: MESSAGE_TYPES.EXPORT_ANTIGRAVITY_MD,
        markdown,
        title
      });

      if (res && res.continuationPrompt) {
        try {
          await bridge.writeClipboard(res.continuationPrompt);
          if (fallbackBox) fallbackBox.hidden = true;
          alert('✅ ส่งออกไฟล์ .md สำเร็จ และ Copy คำสั่งสำหรับเปิดใน Antigravity เรียบร้อยแล้ว!');
        } catch (err) {
          if (fallbackBox && fallbackTextarea) {
            fallbackTextarea.value = res.continuationPrompt;
            fallbackBox.hidden = false;
            fallbackTextarea.select();
          }
        }
      }
    };
  }

  // Initial render
  render(currentState);

  return {
    render
  };
}

// Browser environment bootstrap
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage) {
  document.addEventListener('DOMContentLoaded', async () => {
    const bridge = {
      getState: () => new Promise((resolve) => chrome.storage.local.get(null, resolve)),
      sendMessage: (msg) => chrome.runtime.sendMessage(msg),
      writeClipboard: (text) => navigator.clipboard.writeText(text)
    };

    const ctrl = await initSidePanelController(document, bridge);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        chrome.storage.local.get(null, (all) => ctrl.render(all));
      }
    });
  });
}
