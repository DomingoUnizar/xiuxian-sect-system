import { CONTENT, getItemById, getMethodById } from '../content/validate';
import { pickMissionFlavor } from '../content/narrativePools';
import { canAffordRecipe } from './alchemy';
import { estimateBreakthroughChance, isAtRealmPeak } from './breakthrough';
import { getCurrentConquestStage } from './conquest';
import { RULE_GRANT_ABILITIES, type RuleAbilityId } from './constants';
import { applyCultivationDelta } from './cultivation';
import { awardSystemXp } from './destinyTraits';
import { appendFact, nextEntityId } from './facts';
import { canAffordForging } from './forging';
import { computeMemberPowerScore, getCultivationPerRound } from './power';
import { createStreamRng } from './prng';
import type {
  LedgerEntry,
  Member,
  Mission,
  MissionTargetType,
  Reservation,
  RewardKind,
  RewardSpec,
  WorldState,
} from './types';

export const METHOD_GRANT_DAOYUAN_COST = 8;

export const GRANTABLE_METHOD_IDS = [
  'method_jinglei_jue',
  'method_qinglian_huifeng',
  'method_chaoxi_guiyuan',
  'method_fenhuo_tiqing',
  'method_basic_sword',
  'method_basic_fire',
] as const;

export function pickBestPillInVault(state: Pick<WorldState, 'inventory'>): string | null {
  const order = [
    'pill_humai_2_supreme',
    'pill_humai_2_high',
    'pill_humai_2_mid',
    'pill_ningling_1_mid',
    'pill_ningling_1_low',
  ];
  for (const pid of order) {
    if ((state.inventory.pills[pid] ?? 0) > 0) return pid;
  }
  const anyEntry = Object.entries(state.inventory.pills).find(([, qty]) => qty > 0);
  return anyEntry ? anyEntry[0] : null;
}

export function pickRecommendedMethodForHost(
  member: Pick<Member, 'knownMethods'>,
  targetType: MissionTargetType,
): string | null {
  const preferredOrder =
    targetType === 'first_alchemy' ||
    targetType === 'followup_alchemy_humai' ||
    targetType === 'followup_heritage_fenhuo'
      ? ['method_chaoxi_guiyuan', 'method_fenhuo_tiqing', 'method_basic_fire', 'method_qinglian_huifeng']
      : targetType === 'realm_breakthrough' || targetType === 'daily_cultivate'
        ? ['method_chaoxi_guiyuan', 'method_qinglian_huifeng', 'method_jinglei_jue']
        : ['method_jinglei_jue', 'method_qinglian_huifeng', 'method_chaoxi_guiyuan', 'method_basic_sword'];
  for (const mId of preferredOrder) {
    if (!member.knownMethods.includes(mId)) return mId;
  }
  for (const mId of GRANTABLE_METHOD_IDS) {
    if (!member.knownMethods.includes(mId)) return mId;
  }
  return null;
}

export interface IssueMissionParams {
  commandId: string;
  recipientId: string;
  targetType: MissionTargetType;
  rewardKind?: RewardKind;
  rewardRounds?: number;
  deadlineTicks?: number;
  abilityId?: RuleAbilityId;
  rewardItemId?: string;
  rewardMethodId?: string;
  includeHiddenReward?: boolean;
  source?: Mission['source'];
  standingRuleId?: string;
}

export function getMissionAvailability(
  state: Pick<WorldState, 'missions' | 'inventory' | 'arenaOpponents' | 'members' | 'spiritBeasts'> &
    Partial<Pick<WorldState, 'activePhenomenon' | 'conquestStage'>>,
  member: Member,
  targetType: MissionTargetType,
): { ok: boolean; reason?: string } {
  if (!member.binding.bound || member.status === 'departed' || member.status === 'dead') {
    return { ok: false, reason: `${member.name} 当前不可接收新私令（未绑定、已退宗或已陨落）。` };
  }
  const hasDuplicateActive = state.missions.some(
    (m) =>
      m.recipientId === member.id &&
      m.targetType === targetType &&
      (m.status === 'issued' || m.status === 'accepted'),
  );
  if (hasDuplicateActive) {
    return { ok: false, reason: `${member.name} 身上已有进行中的同类任务，请等待该令先结算。` };
  }

  if (targetType === 'first_alchemy') {
    if (!member.hasAlchemyFire) {
      return { ok: false, reason: `${member.name} 尚未掌握运火起炉诀，暂不能接「首炼灵丹」。` };
    }
    if (member.hasCompletedFirstAlchemy) {
      return { ok: false, reason: `${member.name} 已达成过首炼，可改发「续炼护脉丹」或「承传分火提清」。` };
    }
    const afford = canAffordRecipe(state, 'recipe_ningling');
    if (!afford.ok) return afford;
  } else if (targetType === 'first_arena_win') {
    if (member.hasWonFirstArena) {
      return { ok: false, reason: `${member.name} 已取得同境首胜，可改发「试剑台复赛」或「寒鸦岭外试锋」。` };
    }
    if (!state.arenaOpponents.some((o) => o.available)) {
      return { ok: false, reason: '试剑台眼下暂无可用同境对手。' };
    }
  } else if (targetType === 'followup_alchemy_humai') {
    if (!member.hasCompletedFirstAlchemy) {
      return { ok: false, reason: '需先完成首炼凝灵丹，方可改开二阶护脉丹炉。' };
    }
    const afford = canAffordRecipe(state, 'recipe_humai');
    if (!afford.ok) return afford;
  } else if (targetType === 'followup_heritage_fenhuo') {
    if (!member.hasAlchemyFire) {
      return { ok: false, reason: `${member.name} 不通丹火，暂难承接丹堂传承手法。` };
    }
    const elderKnows = state.members.some(
      (m) => m.status === 'active' && m.knownMethods.includes('method_fenhuo_tiqing'),
    );
    if (!elderKnows) {
      return { ok: false, reason: '丹堂当前无人可讲授「分火提清法」。' };
    }
    const afford = canAffordRecipe(state, 'recipe_humai');
    if (!afford.ok) return afford;
  } else if (targetType === 'followup_arena_rematch') {
    if (!member.unlockedArenaRematch) {
      return { ok: false, reason: `${member.name} 需先在试剑台赢下首场切磋，才开放进阶复赛资格。` };
    }
  } else if (targetType === 'craft_forging_sword') {
    const afford = canAffordForging(state, 'sword');
    if (!afford.ok) return afford;
  } else if (targetType === 'craft_forging_core') {
    const afford = canAffordForging(state, 'core');
    if (!afford.ok) return afford;
  } else if (targetType === 'craft_beast_gather') {
    if ((state.spiritBeasts?.length ?? 0) < 1) {
      return { ok: false, reason: '宗门灵兽园眼下暂无灵兽同行。' };
    }
  } else if (targetType === 'realm_breakthrough') {
    if (!isAtRealmPeak(member)) {
      return {
        ok: false,
        reason: `${member.name} 当前为${member.realm}${member.realmLayer}层（${member.cultivation}/${member.cultivationCap} 缕），须修至九层圆满方能引气冲破大境。`,
      };
    }
  } else if (targetType === 'challenge_gate_duel') {
    if (state.activePhenomenon?.kind !== 'challenger_at_gate' || !state.activePhenomenon.challenger) {
      return { ok: false, reason: '眼下山门安宁，尚无外域散修叩山叫阵（山门天时轮换出现）。' };
    }
  } else if (targetType === 'conquer_frontline') {
    const anyActiveRaid = state.missions.some(
      (m) => m.targetType === 'conquer_frontline' && (m.status === 'issued' || m.status === 'accepted'),
    );
    if (anyActiveRaid) {
      return { ok: false, reason: '本宗已有强将领命出征当前关卡，请待此战凯旋结算！' };
    }
  }
  return { ok: true };
}

export function issueMission(
  state: WorldState,
  params: IssueMissionParams,
): { ok: boolean; message: string; missionId?: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === params.recipientId);
  if (!member) {
    return {
      ok: false,
      message: '该对象尚未正式拜入山门并完成绑定，系统只可对在籍宿主派令。',
      factIds: [],
    };
  }

  const avail = getMissionAvailability(state, member, params.targetType);
  if (!avail.ok) {
    return { ok: false, message: avail.reason ?? '当前条件未满足。', factIds: [] };
  }

  const tpl = CONTENT.missionTemplates.find((t) => t.id === params.targetType);
  if (!tpl) {
    return { ok: false, message: `未知任务模板 ${params.targetType}`, factIds: [] };
  }

  const rewardKind: RewardKind = params.rewardKind ?? 'cultivation_rounds';
  const rounds = params.rewardRounds ?? tpl.defaultRounds;
  const abilitySpec =
    rewardKind === 'rule_ability'
      ? RULE_GRANT_ABILITIES.find((a) => a.id === (params.abilityId ?? 'ability_keep_fire')) ??
        RULE_GRANT_ABILITIES[0]
      : null;

  if (rewardKind === 'rule_ability') {
    if (!state.unlockedPermissions.includes('rule_grant')) {
      return { ok: false, message: '尚未解锁「规则赐予」权限（需道统根基达到 5 点）。', factIds: [] };
    }
    if (abilitySpec && member.grantedAbilities?.includes(abilitySpec.id)) {
      return { ok: false, message: `${member.name} 已领受「${abilitySpec.name}」，无须重复赐予。`, factIds: [] };
    }
  }

  let chosenPillId: string | null = null;
  let chosenPillDef: ReturnType<typeof getItemById> | undefined;
  if (rewardKind === 'pill_grant') {
    chosenPillId = params.rewardItemId ?? pickBestPillInVault(state);
    if (!chosenPillId || (state.inventory.pills[chosenPillId] ?? 0) < 1) {
      return { ok: false, message: '宗门丹库中眼下暂无富余灵丹可供预留奖赏。', factIds: [] };
    }
    chosenPillDef = getItemById(chosenPillId);
    if (!chosenPillDef || chosenPillDef.kind !== 'pill') {
      return { ok: false, message: `所选丹药 ${chosenPillId} 不合法。`, factIds: [] };
    }
  }

  let chosenMethodId: string | null = null;
  let chosenMethodDef: ReturnType<typeof getMethodById> | undefined;
  if (rewardKind === 'method_unlock') {
    chosenMethodId = params.rewardMethodId ?? pickRecommendedMethodForHost(member, params.targetType);
    if (!chosenMethodId) {
      return { ok: false, message: `${member.name} 已通晓本门当前开放诸法，可改赏修为灌注或库藏灵宝。`, factIds: [] };
    }
    if (member.knownMethods.includes(chosenMethodId)) {
      const mName = getMethodById(chosenMethodId)?.name ?? chosenMethodId;
      return { ok: false, message: `${member.name} 早已掌握《${mName}》，无须重复秘传。`, factIds: [] };
    }
    chosenMethodDef = getMethodById(chosenMethodId);
    if (!chosenMethodDef) {
      return { ok: false, message: `未知功法 ${chosenMethodId}`, factIds: [] };
    }
  }

  const daoyuanCost =
    rewardKind === 'rule_ability' && abilitySpec
      ? abilitySpec.daoyuanCost
      : rewardKind === 'method_unlock'
        ? METHOD_GRANT_DAOYUAN_COST
        : rewardKind === 'cultivation_rounds'
          ? tpl.defaultDaoyuanCost
          : 0;
  const hiddenCost = params.includeHiddenReward ? 4 : 0;

  if (daoyuanCost + hiddenCost > 0 && state.daoyuanAvailable < daoyuanCost + hiddenCost) {
    return {
      ok: false,
      message: `可用道源不足（需要 ${daoyuanCost + hiddenCost}，当前可用 ${state.daoyuanAvailable}）。`,
      factIds: [],
    };
  }

  if (rewardKind === 'talisman_escape') {
    const ownedTalismans = state.inventory.talismans.talisman_escape ?? 0;
    if (ownedTalismans < 1) {
      return { ok: false, message: '宗门库中暂无多余凡阶遁符可供预留奖赏。', factIds: [] };
    }
  }

  const missionId = nextEntityId(state, 'mission');
  const perRound = getCultivationPerRound(member);
  const rewardSpec: RewardSpec =
    rewardKind === 'rule_ability' && abilitySpec
      ? {
          slot: 'primary',
          kind: 'rule_ability',
          label: `规则赐予神通「${abilitySpec.name}」`,
          daoyuanCost,
          abilityId: abilitySpec.id,
        }
      : rewardKind === 'method_unlock' && chosenMethodDef
        ? {
            slot: 'primary',
            kind: 'method_unlock',
            label: `${chosenMethodDef.tier}功法《${chosenMethodDef.name}》全卷`,
            daoyuanCost,
            methodId: chosenMethodDef.id,
          }
        : rewardKind === 'pill_grant' && chosenPillDef
          ? {
              slot: 'primary',
              kind: 'pill_grant',
              label: `${chosenPillDef.name}×1（当场服下疗伤增修）`,
              daoyuanCost: 0,
              itemTemplateId: chosenPillDef.id,
              itemQty: 1,
            }
          : rewardKind === 'talisman_escape'
            ? {
                slot: 'primary',
                kind: 'talisman_escape',
                label: '凡阶遁符×1',
                daoyuanCost: 0,
                itemTemplateId: 'talisman_escape',
                itemQty: 1,
              }
            : {
                slot: 'primary',
                kind: 'cultivation_rounds',
                label:
                  rounds === 10
                    ? `十轮修为灌注（按当前常态 ${perRound} 缕/轮折算约 ${rounds * perRound} 缕）`
                    : `${rounds} 轮修为灌注`,
                rounds,
                daoyuanCost,
              };

  const isForgingMission =
    params.targetType === 'craft_forging_sword' || params.targetType === 'craft_forging_core';
  const hiddenReward: RewardSpec | undefined = params.includeHiddenReward
    ? {
        slot: 'hidden',
        kind: 'cultivation_rounds',
        label: '六轮修为灌注（隐藏机缘）',
        rounds: 6,
        daoyuanCost: hiddenCost,
        hiddenConditionLabel: isForgingMission
          ? '以器护道：待同门佩新器赢战'
          : '丹成渡人：待同门服丹精进',
      }
    : undefined;

  // 原子预留道源或实物（含可选隐藏机缘）
  if (daoyuanCost > 0) {
    state.daoyuanAvailable -= daoyuanCost;
    state.daoyuanReserved += daoyuanCost;
    const res: Reservation = {
      id: nextEntityId(state, 'res'),
      missionId,
      slot: 'primary',
      kind: 'daoyuan',
      amount: daoyuanCost,
      status: 'reserved',
      createdAtTick: state.tick,
      resolvedAtTick: null,
    };
    state.reservations.push(res);
  } else if (rewardKind === 'talisman_escape') {
    state.inventory.talismans.talisman_escape -= 1;
    const res: Reservation = {
      id: nextEntityId(state, 'res'),
      missionId,
      slot: 'primary',
      kind: 'item',
      amount: 1,
      itemTemplateId: 'talisman_escape',
      status: 'reserved',
      createdAtTick: state.tick,
      resolvedAtTick: null,
    };
    state.reservations.push(res);
  } else if (rewardKind === 'pill_grant' && chosenPillId) {
    state.inventory.pills[chosenPillId] -= 1;
    const res: Reservation = {
      id: nextEntityId(state, 'res'),
      missionId,
      slot: 'primary',
      kind: 'item',
      amount: 1,
      itemTemplateId: chosenPillId,
      status: 'reserved',
      createdAtTick: state.tick,
      resolvedAtTick: null,
    };
    state.reservations.push(res);
  }

  if (hiddenReward && hiddenCost > 0) {
    state.daoyuanAvailable -= hiddenCost;
    state.daoyuanReserved += hiddenCost;
    state.reservations.push({
      id: nextEntityId(state, 'res'),
      missionId,
      slot: 'hidden',
      kind: 'daoyuan',
      amount: hiddenCost,
      status: 'reserved',
      createdAtTick: state.tick,
      resolvedAtTick: null,
    });
  }

  const duration = params.deadlineTicks ?? tpl.defaultDurationTicks;
  const mission: Mission = {
    id: missionId,
    commandId: params.commandId,
    targetType: params.targetType,
    title: tpl.title,
    description: tpl.description,
    source: params.source ?? 'player_bounty',
    standingRuleId: params.standingRuleId,
    recipientId: member.id,
    issuedAtTick: state.tick,
    deadlineTick: state.tick + duration,
    status: 'issued',
    decisionReason: null,
    primaryReward: rewardSpec,
    ...(hiddenReward ? { hiddenReward } : {}),
    primarySettled: false,
    hiddenSettled: false,
    hiddenReleased: false,
    settledAtTick: null,
    relatedFactIds: [],
  };
  state.missions.push(mission);

  const flavor = pickMissionFlavor(params.targetType, member.id, state.tick);
  const fact = appendFact(state, {
    type: 'mission.issued',
    visibility: 'host_private',
    recipientId: member.id,
    actorIds: [member.id],
    missionId,
    publicSummary: null,
    privateSummary: `【叮！系统发布任务「${mission.title}」】${mission.description} 期限 ${duration} 刻，明奖：${rewardSpec.label}。`,
    systemSummary: `已向宿主 ${member.name} 私发「${mission.title}」（预留 ${daoyuanCost > 0 ? `${daoyuanCost} 道源` : rewardSpec.label}）。`,
    details: `传音附记（参考「${flavor.title}」）：${flavor.systemToast}`,
    cueTier: params.source === 'auto_daily' ? 'silent' : 'major',
  });
  mission.relatedFactIds.push(fact.id);

  return {
    ok: true,
    message: `已向 ${member.name} 发布「${mission.title}」。`,
    missionId,
    factIds: [fact.id],
  };
}

export function releaseMissionReservations(
  state: WorldState,
  mission: Mission,
  reason: string,
  slotFilter?: 'primary' | 'hidden',
): void {
  for (const res of state.reservations) {
    if (res.missionId === mission.id && res.status === 'reserved' && (!slotFilter || res.slot === slotFilter)) {
      res.status = 'released';
      res.resolvedAtTick = state.tick;
      res.reason = reason;
      if (res.kind === 'daoyuan') {
        state.daoyuanReserved = Math.max(0, state.daoyuanReserved - res.amount);
        state.daoyuanAvailable += res.amount;
      } else if (res.kind === 'item' && res.itemTemplateId) {
        if (res.itemTemplateId === 'talisman_escape') {
          state.inventory.talismans.talisman_escape =
            (state.inventory.talismans.talisman_escape ?? 0) + res.amount;
        } else if (getItemById(res.itemTemplateId)?.kind === 'pill') {
          state.inventory.pills[res.itemTemplateId] =
            (state.inventory.pills[res.itemTemplateId] ?? 0) + res.amount;
        }
      }
      if (res.slot === 'hidden') {
        mission.hiddenReleased = true;
      }
    }
  }
}

export function evaluateHostMissionDecisions(state: WorldState): void {
  const issuedMissions = state.missions
    .filter((m) => m.status === 'issued')
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const mission of issuedMissions) {
    const member = state.members.find((m) => m.id === mission.recipientId);
    if (!member || member.status === 'departed' || member.status === 'dead') {
      mission.status = 'declined';
      mission.decisionReason = '宿主已不在籍，任务自动取消并归还预留。';
      releaseMissionReservations(state, mission, mission.decisionReason);
      continue;
    }

    // 真实自主推辞逻辑（若所悬赏恰好对症——如带伤赐救命丹药或谨慎赐保命遁符——宿主反而会咬牙应下）
    const isLifesavingHook =
      mission.primaryReward.kind === 'pill_grant' ||
      mission.primaryReward.kind === 'talisman_escape';
    let declineReason: string | null = null;
    if (
      (mission.targetType === 'first_arena_win' ||
        mission.targetType === 'followup_arena_rematch' ||
        mission.targetType === 'followup_wild_expedition' ||
        mission.targetType === 'conquer_frontline') &&
      (member.injuries.length > 0 || member.hp < member.maxHp * 0.45) &&
      !isLifesavingHook
    ) {
      declineReason = `${member.name} 自觉尚有伤势在身（气血 ${member.hp}/${member.maxHp}），婉拒冒进出战。`;
    } else if (
      mission.targetType === 'followup_wild_expedition' &&
      member.personality === '谨慎' &&
      (state.inventory.talismans.talisman_escape ?? 0) < 1 &&
      mission.primaryReward.daoyuanCost < 6 &&
      !isLifesavingHook
    ) {
      declineReason = `${member.name} 性情谨慎，见库中无遁符护身且奖赏未足抵险，推辞了此趟山外试锋。`;
    }

    const flavor = pickMissionFlavor(mission.targetType, member.id, mission.issuedAtTick);

    if (declineReason) {
      mission.status = 'declined';
      mission.decisionReason = declineReason;
      releaseMissionReservations(state, mission, declineReason);
      const fact = appendFact(state, {
        type: 'mission.declined',
        visibility: 'host_private',
        recipientId: member.id,
        actorIds: [member.id],
        missionId: mission.id,
        publicSummary: null,
        privateSummary: `你思量眼下处境，暂且推辞了任务「${mission.title}」（${declineReason}）。心念：「${flavor.hostInnerDecline}」`,
        systemSummary: `宿主 ${member.name} 自主推辞「${mission.title}」：${declineReason} 已全额释出预留。`,
        cueTier: 'notable',
      });
      mission.relatedFactIds.push(fact.id);
      continue;
    }

    mission.status = 'accepted';
    mission.decisionReason = '应下私令，已依自身本领着手准备。';
    const accFact = appendFact(state, {
      type: 'mission.accepted',
      visibility: 'host_private',
      recipientId: member.id,
      actorIds: [member.id],
      missionId: mission.id,
      publicSummary: null,
      privateSummary: `已接下私令「${mission.title}」，即将择时行功履约。心念：「${flavor.hostInnerAccept}」`,
      systemSummary: `宿主 ${member.name} 接受私令「${mission.title}」。`,
      cueTier: 'silent',
    });
    mission.relatedFactIds.push(accFact.id);
  }
}

export function grantRewardSlotIdempotent(
  state: WorldState,
  mission: Mission,
  member: Member,
  slot: 'primary' | 'hidden',
  causeFactId?: string,
): boolean {
  const spec = slot === 'primary' ? mission.primaryReward : mission.hiddenReward;
  if (!spec) return false;
  if (slot === 'primary' && mission.primarySettled) return false;
  if (slot === 'hidden' && mission.hiddenSettled) return false;

  const ledgerId = `${mission.id}:${slot}:${member.id}`;
  if (state.ledger.some((l) => l.id === ledgerId)) {
    // 幂等保护：账本已有记录时严禁重复发奖
    if (slot === 'primary') mission.primarySettled = true;
    else mission.hiddenSettled = true;
    return false;
  }

  // 消耗对应预留
  for (const res of state.reservations) {
    if (res.missionId === mission.id && res.slot === slot && res.status === 'reserved') {
      res.status = 'consumed';
      res.resolvedAtTick = state.tick;
      if (res.kind === 'daoyuan') {
        state.daoyuanReserved = Math.max(0, state.daoyuanReserved - res.amount);
      }
    }
  }

  let rewardText = spec.label;
  let ledgerEntry: LedgerEntry;

  if (spec.kind === 'cultivation_rounds') {
    const rounds = spec.rounds ?? 10;
    const perRound = getCultivationPerRound(member);
    const totalGain = rounds * perRound;
    const beforePower = computeMemberPowerScore(member);
    const change = applyCultivationDelta(member, totalGain);
    const afterPower = computeMemberPowerScore(member);

    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'cultivation_grant',
      delta: change.delta,
      summary: `「${mission.title}」兑现 ${rounds} 轮修为灌注：+${change.delta} 缕（${change.beforeCultivation} → ${change.afterCultivation}，战力 ${beforePower} → ${afterPower}）`,
    };
    rewardText = `${rounds} 轮修为灌注实得 +${change.delta} 缕（修为 ${change.beforeCultivation} → ${change.afterCultivation}${
      change.afterLayer > change.beforeLayer ? `，晋至${member.realm}${change.afterLayer}层` : ''
    }，战力 ${beforePower} → ${afterPower}）`;
  } else if (spec.kind === 'talisman_escape') {
    const qty = spec.itemQty ?? 1;
    // 从预留扣减后实打实交入该宿主个人行囊
    member.pouchTalismans = (member.pouchTalismans ?? 0) + qty;
    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'item_transfer',
      delta: qty,
      itemTemplateId: 'talisman_escape',
      summary: `「${mission.title}」兑现：凡阶遁符×${qty} 已入 ${member.name} 行囊`,
    };
    rewardText = `凡阶遁符×${qty} 已收入行囊（现持 ${member.pouchTalismans} 张）`;
  } else if (spec.kind === 'pill_grant' && spec.itemTemplateId) {
    const itemDef = getItemById(spec.itemTemplateId);
    const heal = itemDef?.healHp ?? 14;
    const cultBonus = itemDef?.cultivationBonus ?? 18;
    const tox = itemDef?.toxicity ?? 1;
    const beforePower = computeMemberPowerScore(member);
    member.hp = Math.min(member.maxHp, member.hp + heal);
    if (member.injuries.length > 0) {
      member.injuries.shift();
    }
    member.pillToxicity += tox;
    const change = applyCultivationDelta(member, cultBonus);
    const afterPower = computeMemberPowerScore(member);
    const itemName = itemDef?.name ?? spec.itemTemplateId;
    member.notes.push(`履约获赐「${itemName}」并当场服下，修为 +${change.delta} 缕`);
    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'item_transfer',
      delta: change.delta,
      itemTemplateId: spec.itemTemplateId,
      summary: `「${mission.title}」兑现赐丹「${itemName}」：气血回复且修为 +${change.delta} 缕（战力 ${beforePower} → ${afterPower}）`,
    };
    rewardText = `「${itemName}」化入体内，修为 +${change.delta} 缕、气血稳住（战力 ${beforePower} → ${afterPower}）`;
  } else if (spec.kind === 'method_unlock' && spec.methodId) {
    const methodDef = getMethodById(spec.methodId);
    const beforePower = computeMemberPowerScore(member);
    if (!member.knownMethods.includes(spec.methodId)) {
      member.knownMethods.push(spec.methodId);
    }
    if (methodDef) {
      member.manualRatePerRound = Math.max(member.manualRatePerRound, methodDef.cultivationRate);
      if (spec.methodId === 'method_chaoxi_guiyuan') {
        member.meridianCapPerRound = Math.max(member.meridianCapPerRound, 10);
        member.caveSupplyPerRound = Math.max(member.caveSupplyPerRound, 11);
      }
      if (spec.methodId === 'method_basic_fire') {
        member.hasAlchemyFire = true;
      }
    }
    const afterPower = computeMemberPowerScore(member);
    const methodName = methodDef?.name ?? spec.methodId;
    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'method_grant',
      delta: 1,
      methodId: spec.methodId,
      summary: `「${mission.title}」兑现：传入《${methodName}》（战力 ${beforePower} → ${afterPower}）`,
    };
    rewardText = `《${methodName}》全本传入识海（每轮吐纳升至 ${getCultivationPerRound(member)} 缕，战力 ${beforePower} → ${afterPower}）`;
  } else if (spec.kind === 'rule_ability' && spec.abilityId) {
    member.grantedAbilities = member.grantedAbilities ?? [];
    if (!member.grantedAbilities.includes(spec.abilityId)) {
      member.grantedAbilities.push(spec.abilityId);
    }
    if (spec.abilityId === 'ability_beast_awakening' && (state.spiritBeasts?.length ?? 0) > 0) {
      const targetBeast =
        state.spiritBeasts!.find((b) => b.id === member.bondedBeastId) ?? state.spiritBeasts![0];
      targetBeast.awakened = true;
      if (!targetBeast.traits.includes('隔岩辨泉')) targetBeast.traits.push('隔岩辨泉');
    }
    const abilityDef = RULE_GRANT_ABILITIES.find((a) => a.id === spec.abilityId);
    const abilityName = abilityDef?.name ?? spec.abilityId;
    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'ability_grant',
      delta: 1,
      abilityId: spec.abilityId,
      summary: `「${mission.title}」兑现规则神通：${abilityName}`,
    };
    rewardText = `永久神通「${abilityName}」已融入手骨识海（${abilityDef?.description ?? ''}）`;
  } else {
    ledgerEntry = {
      id: ledgerId,
      settlementId: mission.id,
      effectIndex: slot === 'primary' ? 0 : 1,
      tick: state.tick,
      recipientId: member.id,
      kind: 'cultivation_grant',
      delta: 0,
      summary: `「${mission.title}」结算`,
    };
  }

  state.ledger.push(ledgerEntry);

  // 高爽感「气运暴击返还」（tick >= 12 且非日常任务触发，完全确定性不破坏早前期基线）
  let critBanner = '';
  if (state.tick >= 12 && mission.source !== 'auto_daily' && spec.kind !== 'rule_ability') {
    const critRng = createStreamRng(state.seed, 'crit_rebate', `${mission.id}:${slot}`, 0);
    const critRoll = critRng.nextInt(1, 100);
    const mult = critRoll <= 6 ? 10 : critRoll <= 22 ? 5 : critRoll <= 55 ? 2 : 1;
    if (mult > 1) {
      const bonusCult = mult === 10 ? 120 : mult === 5 ? 65 : 28;
      const daoyuanRebate = mult === 10 ? 36 : mult === 5 ? 18 : 8;
      const bonusPill = mult >= 5;
      const bonusChange = applyCultivationDelta(member, bonusCult);
      state.daoyuanAvailable += daoyuanRebate;
      if (bonusPill) {
        state.inventory.pills.pill_humai_2_supreme = (state.inventory.pills.pill_humai_2_supreme ?? 0) + 1;
      }
      state.ledger.push({
        id: `${ledgerId}:crit`,
        settlementId: mission.id,
        effectIndex: 2,
        tick: state.tick,
        recipientId: 'system',
        kind: 'daoyuan_gain',
        delta: daoyuanRebate,
        summary: `💥 触发 ×${mult} 倍气运暴击返还！宿主再增 +${bonusChange.delta} 缕修为，系统返还 +${daoyuanRebate} 道源${
          bonusPill ? '并爆入二阶极品护脉丹×1' : ''
        }`,
      });
      critBanner = ` 💥【触发 ×${mult} 倍气运暴击！】宿主暴涨 +${bonusChange.delta} 缕，系统返还 +${daoyuanRebate} 道源${
        bonusPill ? ' + 二阶极品护脉丹×1' : ''
      }！`;
    }
  }

  if (slot === 'primary') {
    mission.primarySettled = true;
    if (mission.hiddenReward && !mission.hiddenSettled && mission.hiddenDeadlineTick == null) {
      mission.hiddenDeadlineTick = state.tick + 24;
    }
    if (mission.source === 'player_bounty') {
      awardSystemXp(state, 30);
    }
  } else {
    mission.hiddenSettled = true;
  }

  const rewardFact = appendFact(state, {
    type: slot === 'hidden' ? 'hidden_reward.triggered' : 'reward.granted',
    visibility: 'host_private',
    recipientId: member.id,
    actorIds: [member.id],
    missionId: mission.id,
    causeIds: causeFactId ? [causeFactId] : [],
    publicSummary: null,
    privateSummary:
      slot === 'hidden'
        ? `【叮！隐藏奖励触发「${mission.title}」】${rewardText}。此份追加机缘即时生效，旁人无从得知。${critBanner}`
        : `【叮！任务完成「${mission.title}」】${rewardText}。此份回馈即时生效，旁人无从得知来由。${critBanner}`,
    systemSummary: `${member.name} ${slot === 'hidden' ? '触发隐藏机缘' : '完成'}「${mission.title}」，已兑现：${rewardText}。${critBanner}`,
    cueTier: mission.source === 'auto_daily' ? 'silent' : 'major',
  });
  mission.relatedFactIds.push(rewardFact.id);

  return true;
}

export function grantRuleAbility(
  state: WorldState,
  params: { commandId: string; recipientId: string; abilityId: RuleAbilityId },
): { ok: boolean; message: string; factIds: string[] } {
  if (!state.unlockedPermissions.includes('rule_grant')) {
    return {
      ok: false,
      message: '尚未解锁「规则赐予」权限（需道统根基达到 5 点：分火提清 +2，潮纹器道 +3）。',
      factIds: [],
    };
  }
  const member = state.members.find((m) => m.id === params.recipientId && m.status === 'active' && m.binding.bound);
  if (!member) {
    return { ok: false, message: '仅可向已绑定且在籍的活跃宿主直接赐予规则神通。', factIds: [] };
  }
  const ability = RULE_GRANT_ABILITIES.find((a) => a.id === params.abilityId);
  if (!ability) {
    return { ok: false, message: `未知规则神通 ${params.abilityId}`, factIds: [] };
  }
  member.grantedAbilities = member.grantedAbilities ?? [];
  if (member.grantedAbilities.includes(ability.id)) {
    return { ok: false, message: `${member.name} 已经领受过「${ability.name}」，不能重复赐予。`, factIds: [] };
  }
  if (state.daoyuanAvailable < ability.daoyuanCost) {
    return {
      ok: false,
      message: `可用道源不足（赐予「${ability.name}」需 ${ability.daoyuanCost}，当前可用 ${state.daoyuanAvailable}）。`,
      factIds: [],
    };
  }

  state.daoyuanAvailable -= ability.daoyuanCost;
  member.grantedAbilities.push(ability.id);
  if (ability.id === 'ability_beast_awakening' && (state.spiritBeasts?.length ?? 0) > 0) {
    const beast = state.spiritBeasts!.find((b) => b.id === member.bondedBeastId) ?? state.spiritBeasts![0];
    beast.awakened = true;
    if (!beast.traits.includes('隔岩辨泉')) beast.traits.push('隔岩辨泉');
  }

  state.ledger.push({
    id: `ability:${params.commandId}:${member.id}:${ability.id}`,
    settlementId: params.commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: member.id,
    kind: 'ability_grant',
    delta: 1,
    abilityId: ability.id,
    summary: `规则赐予永久神通「${ability.name}」（耗 ${ability.daoyuanCost} 道源）`,
  });

  const fact = appendFact(state, {
    type: 'ability.granted',
    visibility: 'host_private',
    recipientId: member.id,
    actorIds: [member.id],
    publicSummary: null,
    privateSummary: `【叮！规则赐予「${ability.name}」】${ability.description} 从此化入本命，可作长久凭依。`,
    systemSummary: `已耗 ${ability.daoyuanCost} 道源向 ${member.name} 赐予永久神通「${ability.name}」。`,
    cueTier: 'major',
  });

  return {
    ok: true,
    message: `已向 ${member.name} 赐予「${ability.name}」。`,
    factIds: [fact.id],
  };
}

export function evaluatePendingHiddenRewards(
  state: WorldState,
  trigger: { kind: 'pill_consumed' | 'forged_weapon_victory'; actorId: string; causeFactId: string },
): string[] {
  const newFactIds: string[] = [];
  const waiting = state.missions
    .filter(
      (m) =>
        m.status === 'completed' &&
        m.primarySettled &&
        Boolean(m.hiddenReward) &&
        !m.hiddenSettled &&
        !m.hiddenReleased &&
        (m.hiddenDeadlineTick == null || state.tick <= m.hiddenDeadlineTick),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const m of waiting) {
    if (m.recipientId === trigger.actorId) continue;
    const isForgingMission = m.targetType === 'craft_forging_sword' || m.targetType === 'craft_forging_core';
    const matches =
      (trigger.kind === 'forged_weapon_victory' && isForgingMission) ||
      (trigger.kind === 'pill_consumed' && !isForgingMission);
    if (!matches) continue;

    const owner = state.members.find((x) => x.id === m.recipientId);
    if (!owner || owner.status === 'departed' || owner.status === 'dead') continue;

    const granted = grantRewardSlotIdempotent(state, m, owner, 'hidden', trigger.causeFactId);
    if (granted) {
      newFactIds.push(...m.relatedFactIds.slice(-1));
    }
  }
  return newFactIds;
}

export function expireOverdueMissions(state: WorldState): void {
  const activeMissions = state.missions
    .filter((m) => m.status === 'issued' || m.status === 'accepted')
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const mission of activeMissions) {
    if (state.tick < mission.deadlineTick) continue;

    const hadFailedAttempt = mission.relatedFactIds.some((fid) => {
      const f = state.facts.find((x) => x.id === fid);
      if (!f) return false;
      if (f.type === 'member.breakthrough') return true;
      if (!f.battleFactId) return false;
      const bf = state.battleFacts[f.battleFactId];
      return bf && (bf.outcome === 'retreat' || bf.outcome === 'heavy_defeat' || bf.outcome === 'host_died');
    });

    mission.status = hadFailedAttempt ? 'failed' : 'expired';
    mission.settledAtTick = state.tick;
    const reason = hadFailedAttempt
      ? `挑战未能取胜且时限已过，任务失败并释放预留。`
      : `期限（第 ${mission.deadlineTick} 刻）已到仍未成事，任务作废并释出预留。`;
    mission.decisionReason = reason;
    releaseMissionReservations(state, mission, reason);

    const fact = appendFact(state, {
      type: 'mission.expired',
      visibility: 'host_private',
      recipientId: mission.recipientId,
      actorIds: [mission.recipientId],
      missionId: mission.id,
      publicSummary: null,
      privateSummary: `任务「${mission.title}」已到期结束（${reason}）。`,
      systemSummary: `私令「${mission.title}」未完成（${reason}），预留资源已全部返还可用额。`,
      cueTier: 'notable',
    });
    mission.relatedFactIds.push(fact.id);
  }

  // 主奖已结但隐藏机缘窗口过期：释出对应的隐藏奖预留
  const expiredHidden = state.missions
    .filter(
      (m) =>
        m.primarySettled &&
        Boolean(m.hiddenReward) &&
        !m.hiddenSettled &&
        !m.hiddenReleased &&
        m.hiddenDeadlineTick != null &&
        state.tick > m.hiddenDeadlineTick,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const mission of expiredHidden) {
    releaseMissionReservations(state, mission, '隐藏机缘窗口期已过，返还对应预留道源。', 'hidden');
  }
}

export function consumePillForMember(
  state: WorldState,
  memberId: string,
  pillTemplateId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === memberId);
  if (!member || member.status === 'departed' || member.status === 'dead') {
    return { ok: false, message: '无法为离宗或已故人员配发丹药。', factIds: [] };
  }
  const owned = state.inventory.pills[pillTemplateId] ?? 0;
  if (owned < 1) {
    return { ok: false, message: '宗门丹库中该类丹药存量不足。', factIds: [] };
  }
  const itemDef = getItemById(pillTemplateId);
  if (!itemDef || itemDef.kind !== 'pill') {
    return { ok: false, message: '所选物品并非可服用丹药。', factIds: [] };
  }

  state.inventory.pills[pillTemplateId] = owned - 1;
  const heal = itemDef.healHp ?? 10;
  const cultBonus = itemDef.cultivationBonus ?? 12;
  const tox = itemDef.toxicity ?? 1;

  member.hp = Math.min(member.maxHp, member.hp + heal);
  if (member.injuries.length > 0) {
    member.injuries.shift();
  }
  member.pillToxicity += tox;
  const change = applyCultivationDelta(member, cultBonus);
  member.notes.push(`服用宗门丹库「${itemDef.name}」，伤势好转且修为 +${change.delta} 缕`);

  const fact = appendFact(state, {
    type: 'herb.gathered',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    publicSummary: `${member.name} 自宗门丹库领用「${itemDef.name}」一枚服下，气血稳住（${member.hp}/${member.maxHp}），修为增至 ${change.afterCultivation} 缕。`,
    privateSummary: null,
    systemSummary: `实物消耗：${member.name} 服用了丹库中的 ${itemDef.name}（丹库余 ${state.inventory.pills[pillTemplateId]} 枚）。`,
    cueTier: 'routine',
  });

  const hiddenFactIds = evaluatePendingHiddenRewards(state, {
    kind: 'pill_consumed',
    actorId: member.id,
    causeFactId: fact.id,
  });

  return {
    ok: true,
    message: `${member.name} 已服下 ${itemDef.name}，修为增至 ${change.afterCultivation} 缕。`,
    factIds: [fact.id, ...hiddenFactIds],
  };
}

export interface MissionHookPreview {
  enthusiasm: 'eager' | 'willing' | 'reluctant' | 'blocked';
  headline: string;
  innerThought: string;
  successChance: number;
  chanceLabel: string;
}

/**
 * 实时推演当前「密令 × 赏格」对选中宿主的心理诱因与成算预估，让“看人下钩子”有真实博弈依据。
 */
export function evaluateMissionHookPreview(
  state: Pick<
    WorldState,
    'missions' | 'inventory' | 'arenaOpponents' | 'members' | 'spiritBeasts' | 'activePhenomenon'
  > &
    Partial<Pick<WorldState, 'conquestStage'>>,
  member: Member,
  targetType: MissionTargetType,
  rewardKind: RewardKind,
  opts?: { rewardMethodId?: string; rewardItemId?: string; abilityId?: RuleAbilityId },
): MissionHookPreview {
  const avail = getMissionAvailability(state, member, targetType);
  if (!avail.ok) {
    return {
      enthusiasm: 'blocked',
      headline: '条件未到，尚不能发令',
      innerThought: avail.reason ?? '眼下机缘未合，需先补足前置或换个人选。',
      successChance: 0,
      chanceLabel: '未开启',
    };
  }

  let successChance = 95;
  let chanceLabel = '十拿九稳';
  if (targetType === 'realm_breakthrough') {
    const bt = estimateBreakthroughChance(state, member);
    successChance = bt.chance;
    chanceLabel = `破境成算 ${bt.chance}%（${bt.reasons.slice(0, 2).join(' · ')}）`;
  } else if (
    targetType === 'first_arena_win' ||
    targetType === 'followup_arena_rematch' ||
    targetType === 'challenge_gate_duel'
  ) {
    const opp =
      targetType === 'challenge_gate_duel' && state.activePhenomenon?.kind === 'challenger_at_gate'
        ? state.activePhenomenon.challenger
        : targetType === 'followup_arena_rematch'
          ? state.arenaOpponents[1] ?? state.arenaOpponents[0]
          : state.arenaOpponents[0];
    const myPow = computeMemberPowerScore(member);
    const oppPow = opp?.powerScore ?? 96;
    const diff = myPow - oppPow - (member.injuries.length > 0 ? 14 : 0);
    successChance = Math.max(22, Math.min(96, 65 + diff * 3));
    chanceLabel = `胜算约 ${successChance}%（战力 ${myPow} 对阵 ${opp?.name ?? '同境对手'} ${oppPow}）`;
  } else if (targetType === 'conquer_frontline') {
    const stage = getCurrentConquestStage(state.conquestStage ?? 0);
    const myPow = computeMemberPowerScore(member);
    const oppPow = stage.opponent.powerScore;
    const diff = myPow - oppPow - (member.injuries.length > 0 ? 18 : 0);
    successChance = Math.max(12, Math.min(98, 60 + diff * 2));
    chanceLabel = `征伐把握 ${successChance}%（我方 ${myPow} vs ${stage.opponent.name} ${oppPow}）`;
  } else if (targetType === 'followup_wild_expedition') {
    const myPow = computeMemberPowerScore(member);
    const hasTalisman = (member.pouchTalismans ?? 0) > 0 || (state.inventory.talismans.talisman_escape ?? 0) > 0;
    successChance = Math.max(30, Math.min(92, 62 + (myPow - 102) * 2 + (hasTalisman ? 10 : 0)));
    chanceLabel = `探险把握 ${successChance}%${hasTalisman ? '（有遁符兜底）' : '（缺遁符险境较高）'}`;
  } else if (targetType === 'first_alchemy' || targetType === 'followup_alchemy_humai' || targetType === 'followup_heritage_fenhuo') {
    const hasCore = Boolean(state.inventory.furnaceHasWarmCore);
    const hasFireSkill = member.knownMethods.includes('method_fenhuo_tiqing') || targetType === 'followup_heritage_fenhuo';
    successChance = Math.max(
      55,
      Math.min(
        98,
        74 +
          member.craftRank.alchemy * 6 +
          (hasCore ? 10 : 0) +
          (hasFireSkill ? 8 : 0) +
          (state.activePhenomenon?.kind === 'earth_fire_surge' ? 8 : 0),
      ),
    );
    chanceLabel = `成丹成算 ${successChance}%${state.activePhenomenon?.kind === 'earth_fire_surge' ? '（地火旺势助力）' : ''}`;
  } else {
    successChance = 96;
    chanceLabel = '稳妥可成（96%）';
  }

  const isCombatOrWild =
    targetType === 'first_arena_win' ||
    targetType === 'followup_arena_rematch' ||
    targetType === 'followup_wild_expedition' ||
    targetType === 'challenge_gate_duel' ||
    targetType === 'conquer_frontline';

  if (member.injuries.length > 0 && isCombatOrWild) {
    if (rewardKind === 'pill_grant') {
      const pillName = getItemById(opts?.rewardItemId ?? pickBestPillInVault(state) ?? '')?.name ?? '库藏灵丹';
      return {
        enthusiasm: 'eager',
        headline: '带伤见丹心动 · 拼死应命',
        innerThought: `「正愁旧伤未愈难熬，竟肯悬赐${pillName}？弟子带伤亦拼这一场！」`,
        successChance,
        chanceLabel,
      };
    }
    if (rewardKind === 'talisman_escape') {
      return {
        enthusiasm: 'willing',
        headline: '携遁符兜底 · 勉强应命',
        innerThought: '「幸亏先许了保命遁符，即便场面不利也能保身脱身。」',
        successChance,
        chanceLabel,
      };
    }
    return {
      enthusiasm: 'reluctant',
      headline: '⚠️ 宿主带伤拒战预警',
      innerThought: `「身上尚带旧伤（${member.injuries[0]}），若只许常规修为多半不敢贸然赴战！」`,
      successChance,
      chanceLabel,
    };
  }

  if (targetType === 'followup_wild_expedition' && member.personality === '谨慎' && rewardKind === 'talisman_escape') {
    return {
      enthusiasm: 'eager',
      headline: '精准拿捏性情 · 欣然上山',
      innerThought: '「既赏保命遁符压阵，山外虽险亦敢走这一遭！」',
      successChance,
      chanceLabel,
    };
  }

  if (rewardKind === 'method_unlock') {
    const mId = opts?.rewardMethodId ?? pickRecommendedMethodForHost(member, targetType);
    const mName = mId ? getMethodById(mId)?.name ?? '玄阶秘法' : '玄阶秘法';
    return {
      enthusiasm: 'eager',
      headline: `正中求法执念 · 迫不及待（《${mName}》）`,
      innerThought: `「《${mName}》全卷？！此等师门不传之秘竟能垂手可得，哪怕拼尽全力也要办妥！」`,
      successChance,
      chanceLabel,
    };
  }

  if (rewardKind === 'rule_ability') {
    return {
      enthusiasm: 'eager',
      headline: '神通厚赐诱惑极大 · 全力赴命',
      innerThought: '「这等改命之法简直闻所未闻，若能入手必定脱胎换骨！」',
      successChance,
      chanceLabel,
    };
  }

  if (rewardKind === 'pill_grant') {
    const pillName = getItemById(opts?.rewardItemId ?? pickBestPillInVault(state) ?? '')?.name ?? '灵丹';
    return {
      enthusiasm: targetType === 'realm_breakthrough' ? 'eager' : 'willing',
      headline: `真药在望 · 欣然应命（${pillName}）`,
      innerThought: `「有了这枚${pillName}护脉增气，无论冲关还是修为都将稳一大截！」`,
      successChance,
      chanceLabel,
    };
  }

  if (targetType === 'realm_breakthrough') {
    return {
      enthusiasm: successChance >= 65 ? 'eager' : 'willing',
      headline: successChance >= 65 ? '瓶颈松动 · 跃跃欲试冲境' : '破境险阻尚存 · 建议备护脉丹或趁灵潮',
      innerThought:
        successChance >= 65
          ? '「气海已至九层圆满，正差这一声推手点化，今夜便闭关破境！」'
          : '「瓶颈尚紧，若能先服护脉丹或赶上灵潮夜涌，把握便大得多！」',
      successChance,
      chanceLabel,
    };
  }

  if (member.personality === '好战' && isCombatOrWild) {
    return {
      enthusiasm: 'eager',
      headline: '好战性情正合胃口 · 摩拳擦掌',
      innerThought: '「憋了数日早想动手较量一番，还有十轮修为厚赏，爽快！」',
      successChance,
      chanceLabel,
    };
  }

  return {
    enthusiasm: 'willing',
    headline: '赏格公道 · 稳妥接令',
    innerThought: '「条件恰当、耗时也不长，且按那声叮嘱照章办成便是。」',
    successChance,
    chanceLabel,
  };
}
