import { CONTENT } from '../content/validate';
import { appendFact, nextEntityId } from './facts';
import { getMissionAvailability, issueMission } from './missions';
import type { Member, StandingBountyRule, WorldState } from './types';

export function checkAndUnlockPermissions(state: WorldState, causeFactId?: string): string[] {
  const newFactIds: string[] = [];
  for (const tier of CONTENT.systemThresholds) {
    if (
      state.foundationPoints >= tier.foundationRequired &&
      !state.unlockedPermissions.includes(tier.key as WorldState['unlockedPermissions'][number])
    ) {
      state.unlockedPermissions.push(tier.key as WorldState['unlockedPermissions'][number]);
      const unlockTip =
        tier.key === 'standing_bounty'
          ? '现可设定长久生效的常开悬赏规则。'
          : tier.key === 'rule_grant'
            ? '现可消耗道源直接向宿主赐予永久神通，或写进后续任务奖赏。'
            : tier.key === 'multi_causal'
              ? '现可同刻对宗门多人秘密布局大比私令，分别结算因果。'
              : '「宗门法则·万剑归宗」现已彻底解锁！耗 30 道源即可催动全宗同沐二十五轮灌顶！';
      const f = appendFact(state, {
        type: 'system.advanced',
        visibility: 'system_only',
        recipientId: null,
        actorIds: [],
        causeIds: causeFactId ? [causeFactId] : [],
        publicSummary: null,
        privateSummary: null,
        systemSummary: `【叮！系统进阶】道统根基已达 ${state.foundationPoints} 点，「${tier.name}」权限正式解锁！${unlockTip}`,
        cueTier: 'major',
      });
      newFactIds.push(f.id);
    }
  }
  return newFactIds;
}

/**
 * 核验并登记传承首成：
 * 单人自用不加道统根基；只有当非原掌法者的第二位宿主独立使出可传手法成事（成丹、炼器、御兽）时，
 * 才唯一登记 HeritageRecord、发放根基与道源，并检查是否跨过权限门槛。
 */
export function evaluateHeritageOnMethodSuccess(
  state: WorldState,
  successor: Member,
  usedMethodId: string | null,
  causeFactId: string,
): string[] {
  if (!usedMethodId) return [];

  const methodDef = CONTENT.methods.find((m) => m.id === usedMethodId);
  const heritageKey =
    methodDef && 'heritageKey' in methodDef ? (methodDef as { heritageKey?: string }).heritageKey : undefined;
  const heritageDef = CONTENT.heritages.find(
    (h) => h.key === heritageKey || h.methodId === usedMethodId,
  );
  if (!heritageDef) return [];

  // 必须已有另一位前辈/创法者掌握该系手法（防止原掌法者自己施展误计为传承首成）
  const sameLineMethodIds = CONTENT.methods
    .filter((m) => ('heritageKey' in m ? (m as { heritageKey?: string }).heritageKey === heritageDef.key : m.id === heritageDef.methodId))
    .map((m) => m.id);
  const founder = state.members.find(
    (m) =>
      m.id !== successor.id &&
      (sameLineMethodIds.some((id) => m.knownMethods.includes(id)) || m.knownMethods.includes(usedMethodId)),
  );
  if (!founder) return [];

  // 严格按原始成就唯一键判重
  if (state.heritages.some((h) => h.key === heritageDef.key)) {
    return [];
  }

  state.foundationPoints += heritageDef.foundationAward;
  state.daoyuanAvailable += heritageDef.daoyuanAward;

  const hFact = appendFact(state, {
    type: 'heritage.achieved',
    visibility: 'public',
    recipientId: null,
    actorIds: [founder.id, successor.id],
    causeIds: [causeFactId],
    publicSummary: `${successor.name} 独立使出前辈 ${founder.name} 所授「${heritageDef.methodName}」实功告成，正式把这门手法写入宗门传承谱。`,
    privateSummary: null,
    systemSummary: `传承首成！「${heritageDef.methodName}」由 ${founder.name} 传至 ${successor.name} 独立复现，回馈 +${heritageDef.foundationAward} 点道统根基、+${heritageDef.daoyuanAward} 道源。`,
    cueTier: 'major',
  });

  state.heritages.push({
    key: heritageDef.key,
    methodId: heritageDef.methodId,
    methodName: heritageDef.methodName,
    founderId: founder.id,
    successorId: successor.id,
    achievedAtTick: state.tick,
    foundationAwarded: heritageDef.foundationAward,
    daoyuanAwarded: heritageDef.daoyuanAward,
    factId: hFact.id,
  });

  state.ledger.push(
    {
      id: `heritage:${heritageDef.key}:daoyuan`,
      settlementId: heritageDef.key,
      effectIndex: 0,
      tick: state.tick,
      recipientId: 'system',
      kind: 'daoyuan_gain',
      delta: heritageDef.daoyuanAward,
      summary: `传承首成「${heritageDef.methodName}」回馈 +${heritageDef.daoyuanAward} 道源`,
    },
    {
      id: `heritage:${heritageDef.key}:foundation`,
      settlementId: heritageDef.key,
      effectIndex: 1,
      tick: state.tick,
      recipientId: 'system',
      kind: 'foundation_gain',
      delta: heritageDef.foundationAward,
      summary: `传承首成「${heritageDef.methodName}」增加 +${heritageDef.foundationAward} 点道统根基`,
    },
  );

  const advFactIds = checkAndUnlockPermissions(state, hFact.id);
  return [hFact.id, ...advFactIds];
}

export function evaluateHeritageOnAlchemySuccess(
  state: WorldState,
  successor: Member,
  usedMethodId: string | null,
  causeFactId: string,
): string[] {
  return evaluateHeritageOnMethodSuccess(state, successor, usedMethodId, causeFactId);
}

export function createStandingBountyRule(
  state: WorldState,
  params: {
    title: string;
    triggerCondition: 'new_disciple_first_alchemy' | 'new_disciple_first_arena_win';
    rewardKind: 'cultivation_rounds' | 'talisman_escape';
  },
): { ok: boolean; message: string; ruleId?: string; factIds: string[] } {
  if (!state.unlockedPermissions.includes('standing_bounty')) {
    return {
      ok: false,
      message: '尚未解锁「自动悬赏」权限（需道统根基达到 2 点）。',
      factIds: [],
    };
  }

  const targetType =
    params.triggerCondition === 'new_disciple_first_alchemy' ? 'first_alchemy' : 'first_arena_win';
  const daoyuanCost = params.rewardKind === 'cultivation_rounds' ? 6 : 0;
  const ruleId = nextEntityId(state, 'standing');

  const rule: StandingBountyRule = {
    id: ruleId,
    title: params.title.trim() || (targetType === 'first_alchemy' ? '新人首炼常开悬赏' : '新人首胜常开悬赏'),
    triggerCondition: params.triggerCondition,
    targetType,
    rewardKind: params.rewardKind,
    rewardRounds: params.rewardKind === 'cultivation_rounds' ? 10 : undefined,
    rewardItemQty: params.rewardKind === 'talisman_escape' ? 1 : undefined,
    daoyuanCost,
    enabled: true,
    createdAtTick: state.tick,
    triggeredMemberIds: [],
  };
  state.standingBounties.push(rule);

  const fact = appendFact(state, {
    type: 'standing_bounty.created',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `已建立常开悬赏「${rule.title}」：今后符合条件的新入宗宿主将自动收到对应私令（${
      rule.rewardKind === 'talisman_escape' ? '赏凡阶遁符×1' : '赏十轮修为灌注'
    }）。`,
    cueTier: 'notable',
  });

  // 立即可检查现有在籍且符合条件的新弟子
  const firedFacts = evaluateStandingBounties(state);

  return {
    ok: true,
    message: `常开悬赏「${rule.title}」已生效。`,
    ruleId,
    factIds: [fact.id, ...firedFacts],
  };
}

export function toggleStandingBountyRule(
  state: WorldState,
  ruleId: string,
  enabled: boolean,
): { ok: boolean; message: string; factIds: string[] } {
  const rule = state.standingBounties.find((r) => r.id === ruleId);
  if (!rule) {
    return { ok: false, message: `未见常开悬赏规则 ${ruleId}`, factIds: [] };
  }
  rule.enabled = enabled;
  const firedFacts = enabled ? evaluateStandingBounties(state) : [];
  return {
    ok: true,
    message: `常开悬赏「${rule.title}」已${enabled ? '启用' : '暂停'}。`,
    factIds: firedFacts,
  };
}

export function evaluateStandingBounties(state: WorldState): string[] {
  const newFactIds: string[] = [];
  if (!state.unlockedPermissions.includes('standing_bounty')) {
    return newFactIds;
  }

  const enabledRules = state.standingBounties.filter((r) => r.enabled).sort((a, b) => a.id.localeCompare(b.id));
  if (enabledRules.length === 0) return newFactIds;

  // 对非开山初始班底的正式在籍新弟子生效
  const candidates = [...state.members]
    .filter(
      (m) =>
        m.role === 'disciple' &&
        m.status === 'active' &&
        m.binding.bound &&
        !m.binding.bindingId?.startsWith('bind_0_'),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const rule of enabledRules) {
    for (const member of candidates) {
      if (rule.triggeredMemberIds.includes(member.id)) {
        continue;
      }
      const avail = getMissionAvailability(state, member, rule.targetType);
      if (!avail.ok) continue;

      if (rule.rewardKind === 'cultivation_rounds' && state.daoyuanAvailable < rule.daoyuanCost) {
        continue;
      }
      if (rule.rewardKind === 'talisman_escape' && (state.inventory.talismans.talisman_escape ?? 0) < 1) {
        continue;
      }

      const issued = issueMission(state, {
        commandId: `standing:${rule.id}:${member.id}`,
        recipientId: member.id,
        targetType: rule.targetType,
        rewardKind: rule.rewardKind,
        rewardRounds: rule.rewardRounds ?? 10,
        source: 'standing_bounty',
        standingRuleId: rule.id,
      });

      if (issued.ok) {
        rule.triggeredMemberIds.push(member.id);
        newFactIds.push(...issued.factIds);
      }
    }
  }

  return newFactIds;
}
