import { canAffordRecipe, runAlchemyAttempt } from './alchemy';
import { runBeastExpedition } from './beasts';
import { isAtRealmPeak, runRealmBreakthrough } from './breakthrough';
import { runCombatEncounter } from './combat';
import { CONQUEST_STAGES, getCurrentConquestStage, settleConquestVictory } from './conquest';
import { stepSectCrisis } from './crisis';
import { performRoutineCultivation } from './cultivation';
import { stepSectEncounters } from './encounters';
import { appendFact, pruneWorldHistory } from './facts';
import { canAffordForging, runForgingAttempt } from './forging';
import { evaluateHeritageOnAlchemySuccess, evaluateStandingBounties } from './heritage';
import {
  consumePillForMember,
  evaluateHostMissionDecisions,
  evaluatePendingHiddenRewards,
  expireOverdueMissions,
  getMissionAvailability,
  grantRewardSlotIdempotent,
  issueMission,
  pickBestPillInVault,
} from './missions';
import { stepPhenomena } from './phenomena';
import { computeMemberPowerScore } from './power';
import { executeSystemScheme } from './schemes';
import { stepTournaments } from './tournament';
import type { Member, Mission, MissionTargetType, WorldState } from './types';

function runAutoDispatchIfEnabled(state: WorldState): void {
  if (!state.autoDispatchEnabled) return;
  if (state.tick >= 12 && state.tick % 6 === 0) {
    const veinBonus = Math.max(0, (state.sectSpiritVeinLevel ?? 1) - 1);
    state.daoyuanAvailable += 4 + veinBonus;
  }
  if (state.daoyuanAvailable < 12) return;
  if (state.pendingClutch || state.activeDuel?.status === 'fighting') return;

  if (state.daoyuanAvailable >= 18 && state.tick % 4 === 0) {
    const boundActives = [...state.members]
      .filter((m) => m.status === 'active' && m.binding.bound)
      .sort((a, b) => a.id.localeCompare(b.id));
    const nurtureTarget = boundActives.find(
      (m) => (m.injuries.length > 0 || isAtRealmPeak(m)) && (m.schemeCooldowns?.nurture ?? 0) <= state.tick,
    );
    if (nurtureTarget) {
      executeSystemScheme(state, {
        commandId: `auto-scheme-${state.tick}-${nurtureTarget.id}-nurture`,
        memberId: nurtureTarget.id,
        schemeKind: 'nurture',
      });
      return;
    }
    if (boundActives.length >= 2) {
      const rivalryHost = boundActives.find(
        (m) => (m.schemeCooldowns?.dual_rivalry ?? 0) <= state.tick,
      );
      if (rivalryHost) {
        executeSystemScheme(state, {
          commandId: `auto-scheme-${state.tick}-${rivalryHost.id}-rivalry`,
          memberId: rivalryHost.id,
          schemeKind: 'dual_rivalry',
        });
        return;
      }
    }
  }

  const busyRecipientIds = new Set(
    state.missions
      .filter((m) => (m.status === 'issued' || m.status === 'accepted') && m.source !== 'auto_daily')
      .map((m) => m.recipientId),
  );

  const candidates = [...state.members]
    .filter((m) => m.status === 'active' && m.binding.bound && m.injuries.length === 0 && !busyRecipientIds.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) return;

  // 1. 有圆满宿主直接自动发破关冲境令
  const peakHost = candidates.find(
    (m) => isAtRealmPeak(m) && getMissionAvailability(state, m, 'realm_breakthrough').ok,
  );
  if (peakHost) {
    const bestPill = pickBestPillInVault(state);
    issueMission(state, {
      commandId: `auto-${state.tick}-${peakHost.id}-realm_breakthrough`,
      recipientId: peakHost.id,
      targetType: 'realm_breakthrough',
      rewardKind: bestPill ? 'pill_grant' : 'cultivation_rounds',
      rewardItemId: bestPill ?? undefined,
      source: 'player_bounty',
    });
    return;
  }

  // 2. 我方最强闲人战力足以征伐诸域强敌时自动派兵踢馆
  const stage = getCurrentConquestStage(state.conquestStage ?? 0);
  const strongest = [...candidates].sort((a, b) => computeMemberPowerScore(b) - computeMemberPowerScore(a))[0];
  if (
    strongest &&
    computeMemberPowerScore(strongest) >= Math.round(stage.opponent.powerScore * 0.92) &&
    ((state.conquestStage ?? 0) < CONQUEST_STAGES.length || state.tick % 8 === 0) &&
    getMissionAvailability(state, strongest, 'conquer_frontline').ok
  ) {
    issueMission(state, {
      commandId: `auto-${state.tick}-${strongest.id}-conquer_frontline`,
      recipientId: strongest.id,
      targetType: 'conquer_frontline',
      rewardKind: 'cultivation_rounds',
      source: 'player_bounty',
    });
    return;
  }

  // 3. 有叩山强敌时优先迎敌护山
  if (state.activePhenomenon?.kind === 'challenger_at_gate' && state.activePhenomenon.challenger && strongest) {
    if (
      computeMemberPowerScore(strongest) >= state.activePhenomenon.challenger.powerScore - 8 &&
      getMissionAvailability(state, strongest, 'challenge_gate_duel').ok
    ) {
      issueMission(state, {
        commandId: `auto-${state.tick}-${strongest.id}-challenge_gate_duel`,
        recipientId: strongest.id,
        targetType: 'challenge_gate_duel',
        rewardKind: 'cultivation_rounds',
        source: 'player_bounty',
      });
      return;
    }
  }

  // 4. 顺势推进道统传承与日常历练
  const needSpareSword =
    state.inventory.weapons.filter((w) => w.name === '储水回锋剑').length < 2 ||
    candidates.some((m) => (m.equippedWeapon?.attackBonus ?? 0) < 11);
  const needJadeGather = (state.inventory.materials?.mat_chaowen_jade ?? 0) < 6;
  const targetOrder: MissionTargetType[] = [
    'followup_heritage_fenhuo',
    ...(needSpareSword ? (['craft_forging_sword'] as MissionTargetType[]) : []),
    ...(needJadeGather ? (['craft_beast_gather'] as MissionTargetType[]) : []),
    'first_alchemy',
    'first_arena_win',
  ];
  if (state.tick % 4 === 0 && state.daoyuanAvailable >= 20) {
    targetOrder.push('followup_alchemy_humai', 'followup_arena_rematch');
  }
  for (const tid of targetOrder) {
    const match = candidates.find((m) => getMissionAvailability(state, m, tid).ok);
    if (match) {
      issueMission(state, {
        commandId: `auto-${state.tick}-${match.id}-${tid}`,
        recipientId: match.id,
        targetType: tid,
        rewardKind: 'cultivation_rounds',
        source: 'player_bounty',
      });
      return;
    }
  }
}

/**
 * 同一刻内严格遵守的五步调度顺序：
 * 1. 推进山门天时并提交此前已排定到期的行动与真实产出
 * 2. 核验有效任务条件并结算奖励（与道统首成）
 * 3. 关闭到期未成任务并释放预留
 * 4. 触发常开悬赏并让宿主对私令做出接受或推辞
 * 5. 为空闲在籍宿主安排下一步行动（优先履约已接任务，否则依宗门倾向自动运转）
 */
export function stepSingleTick(state: WorldState): void {
  if (state.activeDuel?.status === 'fighting' || state.pendingClutch) {
    return;
  }
  state.tick += 1;
  stepPhenomena(state);
  stepSectEncounters(state);
  stepSectCrisis(state);

  // Step 1: 结算所有到达 resolveAtTick 的活动
  const activeMembersSorted = [...state.members]
    .filter((m) => m.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const member of activeMembersSorted) {
    const act = member.currentActivity;
    if (!act || state.tick < act.resolveAtTick) {
      continue;
    }

    member.currentActivity = null;
    const mission = act.missionId
      ? state.missions.find((m) => m.id === act.missionId)
      : undefined;

    if (act.kind === 'idle_cultivate') {
      performRoutineCultivation(state, member, 1);
      if (mission && mission.targetType === 'daily_cultivate' && mission.status === 'accepted') {
        mission.status = 'completed';
        mission.settledAtTick = state.tick;
        const sf = appendFact(state, {
          type: 'mission.settled',
          visibility: 'host_private',
          recipientId: member.id,
          actorIds: [member.id],
          missionId: mission.id,
          publicSummary: null,
          privateSummary: null,
          systemSummary: `${member.name} 完成日常吐纳任务「${mission.title}」。`,
          cueTier: 'silent',
        });
        grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
      }
    } else if (act.kind === 'alchemy') {
      const isHumai = mission?.targetType === 'followup_alchemy_humai' || mission?.targetType === 'followup_heritage_fenhuo';
      const recipeId = isHumai ? 'recipe_humai' : 'recipe_ningling';

      // 若是传承研习任务，先跟丹堂长老求教「分火提清法」并尝试独自使出
      let learnedFenhuoNow = false;
      if (mission?.targetType === 'followup_heritage_fenhuo' && !member.knownMethods.includes('method_fenhuo_tiqing')) {
        const elder = state.members.find(
          (m) => m.id !== member.id && m.status === 'active' && m.knownMethods.includes('method_fenhuo_tiqing'),
        );
        if (elder) {
          member.knownMethods.push('method_fenhuo_tiqing');
          learnedFenhuoNow = true;
          appendFact(state, {
            type: 'cultivation.progressed',
            visibility: 'public',
            recipientId: null,
            actorIds: [elder.id, member.id],
            publicSummary: `丹堂长老 ${elder.name} 当炉演法，将「分火提清法」运转关窍悉数授与 ${member.name}。`,
            privateSummary: null,
            systemSummary: `传承前奏：${member.name} 从 ${elder.name} 处习得「分火提清法」，即将独自试炼成丹。`,
          });
        }
      }

      const alc = runAlchemyAttempt(state, member, recipeId, {
        useFenhuoMethod:
          learnedFenhuoNow ||
          mission?.targetType === 'followup_heritage_fenhuo' ||
          member.knownMethods.includes('method_fenhuo_tiqing'),
        missionId: mission?.id,
      });

      if (alc) {
        if (mission) mission.relatedFactIds.push(alc.factId);
        if (alc.success) {
          evaluateHeritageOnAlchemySuccess(state, member, alc.alchemyFact.usedMethodId, alc.factId);
          if (mission && mission.status === 'accepted') {
            mission.status = 'completed';
            mission.settledAtTick = state.tick;
            const sf = appendFact(state, {
              type: 'mission.settled',
              visibility: 'host_private',
              recipientId: member.id,
              actorIds: [member.id],
              missionId: mission.id,
              causeIds: [alc.factId],
              publicSummary: null,
              privateSummary: null,
              systemSummary: `${member.name} 依真实丹道规则成丹，达成「${mission.title}」。`,
              cueTier: 'silent',
            });
            grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
          }
        }
      } else if (mission) {
        // 药材途耗导致无法开炉时保留任务直到期限或等待采药
        mission.decisionReason = '炉材暂缺，待宗门采药补齐后再开炉。';
      }
    } else if (act.kind === 'arena') {
      const isGateDuel = mission?.targetType === 'challenge_gate_duel';
      const opp = isGateDuel
        ? (state.activePhenomenon?.kind === 'challenger_at_gate' && state.activePhenomenon.challenger
            ? state.activePhenomenon.challenger
            : state.arenaOpponents[1] ?? state.arenaOpponents[0])
        : (state.arenaOpponents[mission?.targetType === 'followup_arena_rematch' ? 1 : 0] ??
            state.arenaOpponents[0]);
      const bat = runCombatEncounter(state, member, {
        mode: 'arena_duel',
        opponent: opp,
        missionId: mission?.id,
      });
      if (mission) mission.relatedFactIds.push(bat.factId);
      if (bat.victory && member.equippedWeapon?.specialTrait === 'water_tide') {
        evaluatePendingHiddenRewards(state, {
          kind: 'forged_weapon_victory',
          actorId: member.id,
          causeFactId: bat.factId,
        });
      }
      if (bat.victory && isGateDuel) {
        if (state.activePhenomenon?.kind === 'challenger_at_gate') {
          state.activePhenomenon = null;
        }
        state.sectReputation += 6;
        state.inventory.spiritStones.low += 40;
        state.daoyuanAvailable += 5;
      }
      if (bat.victory && mission && mission.status === 'accepted') {
        mission.status = 'completed';
        mission.settledAtTick = state.tick;
        const sf = appendFact(state, {
          type: 'mission.settled',
          visibility: 'host_private',
          recipientId: member.id,
          actorIds: [member.id],
          missionId: mission.id,
          causeIds: [bat.factId],
          publicSummary: null,
          privateSummary: null,
          systemSummary: isGateDuel
            ? `${member.name} 击退叩山强敌，赢得声望+6、下品灵石+40、回馈+5，达成「${mission.title}」。`
            : `${member.name} 于试剑台堂堂获胜，达成「${mission.title}」。`,
          cueTier: 'silent',
        });
        grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
      }
    } else if (act.kind === 'breakthrough') {
      const bt = runRealmBreakthrough(state, member, mission?.id);
      if (mission && bt.factId) {
        mission.relatedFactIds.push(bt.factId);
      }
      if (bt.succeeded && mission && mission.status === 'accepted') {
        mission.status = 'completed';
        mission.settledAtTick = state.tick;
        const sf = appendFact(state, {
          type: 'mission.settled',
          visibility: 'host_private',
          recipientId: member.id,
          actorIds: [member.id],
          missionId: mission.id,
          causeIds: bt.factId ? [bt.factId] : [],
          publicSummary: null,
          privateSummary: null,
          systemSummary: `${member.name} 成功破开大境桎梏晋入${bt.newRealm}1层，达成「${mission.title}」。`,
          cueTier: 'silent',
        });
        grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
      } else if (!bt.succeeded && mission && mission.status === 'accepted') {
        mission.decisionReason = '冲关未竟出关调养，待期限届满将释放预留或积满后重叩大关。';
      }
    } else if (act.kind === 'expedition') {
      if (mission?.targetType === 'conquer_frontline') {
        const stage = getCurrentConquestStage(state.conquestStage ?? 0);
        const bat = runCombatEncounter(state, member, {
          mode: 'arena_duel',
          opponent: stage.opponent,
          missionId: mission.id,
        });
        mission.relatedFactIds.push(bat.factId);
        if (bat.victory) {
          if (member.equippedWeapon?.specialTrait === 'water_tide') {
            evaluatePendingHiddenRewards(state, {
              kind: 'forged_weapon_victory',
              actorId: member.id,
              causeFactId: bat.factId,
            });
          }
          const conquestOutcome = settleConquestVictory(state, member, bat.battleFact.id, mission.id);
          mission.relatedFactIds.push(...conquestOutcome.factIds);
          if (mission.status === 'accepted') {
            mission.status = 'completed';
            mission.settledAtTick = state.tick;
            const sf = appendFact(state, {
              type: 'mission.settled',
              visibility: 'host_private',
              recipientId: member.id,
              actorIds: [member.id],
              missionId: mission.id,
              causeIds: [bat.factId, ...conquestOutcome.factIds],
              publicSummary: null,
              privateSummary: null,
              systemSummary: `${member.name} 「${stage.title}」大捷归宗！${conquestOutcome.systemLootText}，并兑现「${mission.title}」赏格。`,
              cueTier: 'silent',
            });
            grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
          }
        } else if (mission.status === 'accepted') {
          mission.decisionReason = `战败撤回，暂未攻破「${stage.title}」；可先灌顶、洗髓或换赐神兵后再伐！`;
        }
      } else {
        const bat = runCombatEncounter(state, member, {
          mode: 'wild_expedition',
          missionId: mission?.id,
        });
        if (mission) mission.relatedFactIds.push(bat.factId);
        if (!bat.hostDied && bat.victory && mission && mission.status === 'accepted') {
          mission.status = 'completed';
          mission.settledAtTick = state.tick;
          const sf = appendFact(state, {
            type: 'mission.settled',
            visibility: 'host_private',
            recipientId: member.id,
            actorIds: [member.id],
            missionId: mission.id,
            causeIds: [bat.factId],
            publicSummary: null,
            privateSummary: null,
            systemSummary: `${member.name} 自寒鸦岭历练凯旋，达成「${mission.title}」。`,
            cueTier: 'silent',
          });
          grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
        }
      }
    } else if (act.kind === 'forging') {
      const mode = mission?.targetType === 'craft_forging_core' ? 'core' : 'sword';
      const frg = runForgingAttempt(state, member, mode, { missionId: mission?.id });
      if (frg && mission) {
        mission.relatedFactIds.push(frg.factId);
        if (mission.status === 'accepted') {
          mission.status = 'completed';
          mission.settledAtTick = state.tick;
          const sf = appendFact(state, {
            type: 'mission.settled',
            visibility: 'host_private',
            recipientId: member.id,
            actorIds: [member.id],
            missionId: mission.id,
            causeIds: [frg.factId],
            publicSummary: null,
            privateSummary: null,
            systemSummary: `${member.name} 以真实潮纹器道锻成「${frg.productName}」，达成「${mission.title}」。`,
            cueTier: 'silent',
          });
          grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
        }
      }
    } else if (act.kind === 'beast_expedition') {
      const bst = runBeastExpedition(state, member, { missionId: mission?.id });
      if (mission) {
        mission.relatedFactIds.push(bst.factId);
        if (mission.status === 'accepted') {
          mission.status = 'completed';
          mission.settledAtTick = state.tick;
          const sf = appendFact(state, {
            type: 'mission.settled',
            visibility: 'host_private',
            recipientId: member.id,
            actorIds: [member.id],
            missionId: mission.id,
            causeIds: [bst.factId],
            publicSummary: null,
            privateSummary: null,
            systemSummary: `${member.name} 携灵兽赴寒泉采露归宗，达成「${mission.title}」。`,
            cueTier: 'silent',
          });
          grantRewardSlotIdempotent(state, mission, member, 'primary', sf.id);
        }
      }
    } else if (act.kind === 'recover') {
      member.hp = Math.min(member.maxHp, member.hp + 16);
      if (member.injuries.length > 0 && member.hp >= member.maxHp * 0.75) {
        member.injuries.shift();
      }
    }
  }

  // Step 2 & 3: 推进多人大比因果阶段，并检查过期任务释出预留
  stepTournaments(state);
  expireOverdueMissions(state);

  // Step 4: 天道托管自动派令（若已开启）、常开悬赏，随后宿主回应刚下达的私令
  runAutoDispatchIfEnabled(state);
  evaluateStandingBounties(state);
  evaluateHostMissionDecisions(state);

  // 若有门人带伤且丹库有丹药，自动服一枚疗伤，使丹药产物切实流回日常闭环
  for (const member of activeMembersSorted) {
    if (member.status === 'active' && member.injuries.length > 0) {
      const healPill =
        (state.inventory.pills.pill_humai_2_supreme ?? 0) > 0
          ? 'pill_humai_2_supreme'
          : (state.inventory.pills.pill_humai_2_high ?? 0) > 0
            ? 'pill_humai_2_high'
            : (state.inventory.pills.pill_humai_2_mid ?? 0) > 0
              ? 'pill_humai_2_mid'
              : (state.inventory.pills.pill_ningling_1_mid ?? 0) > 0
                ? 'pill_ningling_1_mid'
                : (state.inventory.pills.pill_ningling_1_low ?? 0) > 0
                  ? 'pill_ningling_1_low'
                  : null;
      if (healPill) {
        consumePillForMember(state, member.id, healPill);
      }
    }
  }

  // Step 5: 分配下一阶段行动（优先处理已接受的悬赏任务，否则运行日常吐纳/采药/常规炼丹）
  for (const member of activeMembersSorted) {
    if (member.status !== 'active' || member.currentActivity !== null) {
      continue;
    }

    const acceptedMissions = state.missions
      .filter((m) => m.recipientId === member.id && m.status === 'accepted')
      .sort((a, b) => {
        // 玩家悬赏与常开悬赏优先于自动日常
        const prioA = a.source === 'auto_daily' ? 1 : 0;
        const prioB = b.source === 'auto_daily' ? 1 : 0;
        if (prioA !== prioB) return prioA - prioB;
        return a.issuedAtTick - b.issuedAtTick;
      });

    const nextMission: Mission | undefined = acceptedMissions[0];
    if (nextMission) {
      if (
        nextMission.targetType === 'first_alchemy' ||
        nextMission.targetType === 'followup_alchemy_humai' ||
        nextMission.targetType === 'followup_heritage_fenhuo' ||
        nextMission.targetType === 'daily_alchemy'
      ) {
        const recipeId =
          nextMission.targetType === 'followup_alchemy_humai' ||
          nextMission.targetType === 'followup_heritage_fenhuo'
            ? 'recipe_humai'
            : 'recipe_ningling';
        if (canAffordRecipe(state, recipeId).ok) {
          member.currentActivity = {
            kind: 'alchemy',
            missionId: nextMission.id,
            startedTick: state.tick,
            resolveAtTick: state.tick + (nextMission.targetType === 'followup_heritage_fenhuo' ? 3 : 2),
            summary: `开炉执事：${nextMission.title}`,
          };
          continue;
        }
      } else if (
        nextMission.targetType === 'first_arena_win' ||
        nextMission.targetType === 'followup_arena_rematch' ||
        nextMission.targetType === 'challenge_gate_duel'
      ) {
        member.currentActivity = {
          kind: 'arena',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 2,
          summary:
            nextMission.targetType === 'challenge_gate_duel'
              ? `护山迎敌：${nextMission.title}`
              : `赴试剑台：${nextMission.title}`,
        };
        continue;
      } else if (nextMission.targetType === 'realm_breakthrough') {
        member.currentActivity = {
          kind: 'breakthrough',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 2,
          summary: `静室闭关冲境：${nextMission.title}`,
        };
        continue;
      } else if (nextMission.targetType === 'conquer_frontline') {
        const stage = getCurrentConquestStage(state.conquestStage ?? 0);
        member.currentActivity = {
          kind: 'expedition',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 2,
          summary: `出征踢馆：${stage.title}`,
        };
        continue;
      } else if (nextMission.targetType === 'followup_wild_expedition') {
        member.currentActivity = {
          kind: 'expedition',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 3,
          summary: `出山历练：${nextMission.title}`,
        };
        continue;
      } else if (
        nextMission.targetType === 'craft_forging_sword' ||
        nextMission.targetType === 'craft_forging_core'
      ) {
        const mode = nextMission.targetType === 'craft_forging_core' ? 'core' : 'sword';
        if (canAffordForging(state, mode).ok) {
          member.currentActivity = {
            kind: 'forging',
            missionId: nextMission.id,
            startedTick: state.tick,
            resolveAtTick: state.tick + 2,
            summary: `器堂接纹：${nextMission.title}`,
          };
          continue;
        }
      } else if (nextMission.targetType === 'craft_beast_gather') {
        member.currentActivity = {
          kind: 'beast_expedition',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 2,
          summary: `携兽探泉：${nextMission.title}`,
        };
        continue;
      } else if (nextMission.targetType === 'daily_cultivate') {
        member.currentActivity = {
          kind: 'idle_cultivate',
          missionId: nextMission.id,
          startedTick: state.tick,
          resolveAtTick: state.tick + 2,
          summary: `闭关行功：${nextMission.title}`,
        };
        continue;
      }
    }

    // 无人干预时自主日常：负伤优先休养；老弟子/已成丹者可按药材余量自动采药或补丹；新徒静室吐纳
    if (member.injuries.length > 0 || member.hp < member.maxHp * 0.6) {
      member.currentActivity = {
        kind: 'recover',
        startedTick: state.tick,
        resolveAtTick: state.tick + 2,
        summary: '静室疗伤调息',
      };
    } else if (
      member.role === 'disciple' &&
      (state.inventory.herbs.herb_ningling ?? 0) < 6 &&
      state.tick % 3 === 0
    ) {
      const hasFireSurge = state.activePhenomenon?.kind === 'earth_fire_surge';
      state.inventory.herbs.herb_ningling = (state.inventory.herbs.herb_ningling ?? 0) + 2;
      state.inventory.herbs.herb_huiqi = (state.inventory.herbs.herb_huiqi ?? 0) + 1;
      if (hasFireSurge) {
        state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 1;
      }
      appendFact(state, {
        type: 'herb.gathered',
        visibility: 'public',
        recipientId: null,
        actorIds: [member.id],
        publicSummary: `${member.name} 前往后山药圃采得凝灵草×2、回气草×1${hasFireSurge ? '、护脉草×1（地火旺势催熟）' : ''} 交入宗库。`,
        privateSummary: null,
        systemSummary: `日常采药补给：凝灵草+2、回气草+1${hasFireSurge ? '、护脉草+1' : ''}。`,
        cueTier: 'silent',
      });
      member.currentActivity = {
        kind: 'idle_cultivate',
        startedTick: state.tick,
        resolveAtTick: state.tick + 2,
        summary: '采药归来吐纳调息',
      };
    } else {
      member.currentActivity = {
        kind: 'idle_cultivate',
        startedTick: state.tick,
        resolveAtTick: state.tick + 2,
        summary: '洞府日常吐纳',
      };
    }
  }

  if (state.tick % 48 === 0) {
    pruneWorldHistory(state);
  }
}
