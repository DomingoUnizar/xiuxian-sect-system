import { DEFAULT_MS_PER_TICK, TICKS_PER_DAY } from './constants';
import type { ClockAnchor } from './types';

const SHICHEN_LABELS = [
  '子时',
  '丑时',
  '寅时',
  '卯时',
  '辰时',
  '巳时',
  '午时',
  '未时',
  '申时',
  '酉时',
  '戌时',
  '亥时',
] as const;

export function formatWorldTime(tick: number): {
  year: number;
  day: number;
  shichenIndex: number;
  shichenLabel: string;
  formatted: string;
} {
  const safeTick = Math.max(0, Math.floor(tick));
  const totalDays = Math.floor(safeTick / TICKS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const day = (totalDays % 360) + 1;
  const shichenIndex = safeTick % TICKS_PER_DAY;
  const shichenLabel = SHICHEN_LABELS[shichenIndex];
  return {
    year,
    day,
    shichenIndex,
    shichenLabel,
    formatted: `开山第${year}年 · 第${day}日 ${shichenLabel}`,
  };
}

export function createClockAnchor(nowMs: number, worldTick = 0): ClockAnchor {
  return {
    lastWallClockMs: nowMs,
    worldTick,
    remainderMs: 0,
    msPerTick: DEFAULT_MS_PER_TICK,
    lastCatchUpDurationMs: 0,
    lastCatchUpTicks: 0,
    clockWarning: null,
  };
}

/**
 * 依据当前墙钟与上次已提交水位计算推进刻数。
 * 严格遵守“时钟倒拨以既有水位为下界；异常大跨度显示来源与跨度”。
 */
export function computeElapsedTicks(
  anchor: ClockAnchor,
  nowMs: number,
  maxJumpTicks = 8 * 60 * TICKS_PER_DAY, // 8 小时上限外仍保留提示
): {
  ticksToAdvance: number;
  nextRemainderMs: number;
  effectiveNowMs: number;
  warning: string | null;
} {
  if (!Number.isFinite(nowMs)) {
    return {
      ticksToAdvance: 0,
      nextRemainderMs: anchor.remainderMs,
      effectiveNowMs: anchor.lastWallClockMs,
      warning: '检测到无效系统时间，已维持上一次可靠水位。',
    };
  }
  if (nowMs < anchor.lastWallClockMs) {
    return {
      ticksToAdvance: 0,
      nextRemainderMs: anchor.remainderMs,
      effectiveNowMs: anchor.lastWallClockMs,
      warning: `系统时钟疑似回拨 ${Math.round((anchor.lastWallClockMs - nowMs) / 1000)} 秒，已锁定上一水位不倒退。`,
    };
  }
  const deltaMs = nowMs - anchor.lastWallClockMs + anchor.remainderMs;
  const rawTicks = Math.floor(deltaMs / anchor.msPerTick);
  const nextRemainderMs = deltaMs % anchor.msPerTick;
  let warning: string | null = null;
  if (rawTicks > maxJumpTicks) {
    warning = `检测到跨越 ${Math.round(deltaMs / 60000)} 分钟的系统时钟跳变，将分批补算离线历程。`;
  }
  return {
    ticksToAdvance: rawTicks,
    nextRemainderMs,
    effectiveNowMs: nowMs,
    warning,
  };
}
