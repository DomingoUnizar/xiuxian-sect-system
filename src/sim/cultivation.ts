import { appendFact } from './facts';
import { getCultivationPerRound } from './power';
import type { Member, WorldState } from './types';

export interface CultivationChange {
  beforeCultivation: number;
  afterCultivation: number;
  beforeLayer: number;
  afterLayer: number;
  delta: number;
}

/**
 * 统一修为入账函数：无论日常吐纳还是系统“十轮修为灌注”，增长均即时反映在修为、小关层数与后续实战中。
 */
export function applyCultivationDelta(
  member: Member,
  delta: number,
): CultivationChange {
  const beforeCultivation = member.cultivation;
  const beforeLayer = member.realmLayer;
  member.cultivation += Math.max(0, Math.round(delta));

  // 炼气一至九层或筑基期小关平滑晋升，保证战力真切可见提升
  while (member.cultivation >= member.cultivationCap && member.realmLayer < 9) {
    member.realmLayer += 1;
    member.cultivationCap += 35;
    member.maxHp += 8;
    member.hp = Math.min(member.maxHp, member.hp + 8);
    member.maxQi += 6;
    member.qi = Math.min(member.maxQi, member.qi + 6);
  }

  return {
    beforeCultivation,
    afterCultivation: member.cultivation,
    beforeLayer,
    afterLayer: member.realmLayer,
    delta: member.cultivation - beforeCultivation,
  };
}

export function performRoutineCultivation(
  state: WorldState,
  member: Member,
  rounds = 1,
): CultivationChange {
  const perRound = getCultivationPerRound(member);
  const tideBoost = state.activePhenomenon?.kind === 'spirit_tide';
  const revengeBoost = (state.sectCrisis?.revengeBuffUntilTick ?? 0) > state.tick;
  let gain = tideBoost ? Math.round(perRound * rounds * 1.5) : perRound * rounds;
  if (revengeBoost) {
    gain = Math.round(gain * 1.4);
  }
  if (state.activePerks?.includes('perk_epiphany_halo')) {
    gain = Math.round(gain * 1.35);
  }
  const change = applyCultivationDelta(member, gain);

  // 略微恢复气血与消退轻微丹毒
  member.hp = Math.min(member.maxHp, member.hp + 4 * rounds);
  if (member.pillToxicity > 0) {
    member.pillToxicity = Math.max(0, member.pillToxicity - 1);
  }
  if (member.injuries.length > 0 && member.hp >= member.maxHp * 0.85) {
    member.injuries.shift();
  }

  // 宗门日常吐纳回馈少量道源（太古圣地灵脉可翻倍产出）
  const extraVeinTick = (state.sectSpiritVeinLevel ?? 1) >= 5 ? 2 : 4;
  if (state.tick % extraVeinTick === 0 && member.role === 'disciple') {
    state.daoyuanAvailable += 1;
  }

  // 为避免超长离线产生上万条重复日常吐纳碎片，突破小关或每日子时才写公开纪事（完全确定性，离在线严格一致）
  if (change.afterLayer > change.beforeLayer || state.tick % 12 === 0) {
    appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [member.id],
      publicSummary: `${member.name} 在洞府静室吐纳调息${tideBoost ? '（趁灵潮夜涌多吸五成灵气）' : ''}，修为由 ${change.beforeCultivation} 增至 ${change.afterCultivation} 缕${
        change.afterLayer > change.beforeLayer ? `，顺势破入${member.realm}${change.afterLayer}层` : ''
      }。`,
      privateSummary: null,
      systemSummary: `${member.name} 常态闭关 +${change.delta} 缕（每轮 ${perRound} 缕${tideBoost ? '·灵潮加成×1.5' : ''}，与任务重赏分开记账）。`,
      cueTier: 'silent',
    });
  }

  return change;
}
