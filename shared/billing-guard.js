import { CHANNEL_STATUS } from './constants.js';

export const BILLING_REASONS = Object.freeze({
  SAFE_PRO_PLAYGROUND: 'SAFE_PRO_PLAYGROUND',
  NO_PRO_BADGE: 'NO_PRO_BADGE',
  BILLING_PROMPT_DETECTED: 'BILLING_PROMPT_DETECTED'
});

export function evaluateBillingGuard({
  proBadgePresent = false,
  billingRiskDetected = false,
  signals = []
} = {}) {
  if (billingRiskDetected) {
    return {
      allowAutoInject: false,
      action: 'HOLD_AND_WARN',
      reasonCode: BILLING_REASONS.BILLING_PROMPT_DETECTED,
      channelStatus: CHANNEL_STATUS.BILLING_RISK,
      bannerMessage: '⚠️ พบคำเตือน Cloud Billing หรือ Pay-as-you-go API บน AI Studio — ระงับการวางข้อความอัตโนมัติเพื่อป้องกันค่าใช้จ่าย'
    };
  }

  if (!proBadgePresent) {
    return {
      allowAutoInject: false,
      action: 'HOLD_AND_WARN',
      reasonCode: BILLING_REASONS.NO_PRO_BADGE,
      channelStatus: CHANNEL_STATUS.BILLING_RISK,
      bannerMessage: '⚠️ ไม่พบป้าย [PRO] ที่แถบสถานะ AI Studio — กรุณายืนยันว่าใช้บัญชี Google AI Pro ก่อนยิงงานต่อ'
    };
  }

  return {
    allowAutoInject: true,
    action: 'AUTO_INJECT',
    reasonCode: BILLING_REASONS.SAFE_PRO_PLAYGROUND,
    channelStatus: CHANNEL_STATUS.READY,
    bannerMessage: '✅ ตรวจพบป้าย PRO — ปลอดภัยสำหรับการสนทนาบน Playground โดยตรง'
  };
}
