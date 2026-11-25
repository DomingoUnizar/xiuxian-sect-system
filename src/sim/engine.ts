import { resolvePendingClutch } from './crisis';
import { chooseSystemPerk } from './destinyTraits';
import { resolveSectEncounter } from './encounters';
import { equipWeaponFromVault } from './forging';
import {
  createStandingBountyRule,
  evaluateStandingBounties,
  toggleStandingBountyRule,
} from './heritage';
import { closeLiveDuel, applyDuelCheat, raidCrisisOutpost, startLiveDuel, stepLiveDuel } from './liveDuel';
import { castSystemMiracle } from './miracles';
import { consumePillForMember, grantRuleAbility, issueMission } from './missions';
import { appendFact } from './facts';
import {
  auditionCandidate,
  autoFillRecruitment,
  departMember,
  inviteCandidate,
  openRecruitmentSession,
  rejoinMember,
} from './recruitment';
import { stepSingleTick } from './scheduler';
import { executeSystemScheme } from './schemes';
import { launchMultiCausalTournament } from './tournament';
import {
  exchangeStonesToDaoyuan,
  mentorDisciple,
  openMysteryBox,
  refineEquippedWeapon,
  restockHerbsWithStones,
  upgradeSpiritVein,
} from './treasury';
import type { CommandReceipt, Fact, SimCommand, WorldState } from './types';

export interface AdvanceResult {
  state: WorldState;
  newFacts: Fact[];
  receipts: CommandReceipt[];
}

export function cloneState(state: WorldState): WorldState {
  return structuredClone(state);
}

/**
 * 纯确定性模拟推进入口 `advance(state, untilTick, orderedCommands)`。
 * N2 已接通：玩家发令、预留与释放、真实四步炼丹、文本战斗 V0.2、幂等账本与日常自主运转。
 */
export function advance(
  inputState: WorldState,
  untilTick: number,
  orderedCommands: readonly SimCommand[] = [],
): AdvanceResult {
  const state = cloneState(inputState);
  const startFactSeq = state.nextFactSeq;
  const receipts: CommandReceipt[] = [];
  const targetTick = Math.max(state.tick, Math.floor(untilTick));

  for (const cmd of orderedCommands) {
    const existing = state.receipts[cmd.commandId];
    if (existing) {
      receipts.push(existing);
      continue;
    }

    let ok = false;
    let message = '暂未支持的命令类型。';
    let factIds: string[] = [];
    let memberId: string | undefined;
    let missionId: string | undefined;

    if (cmd.type === 'sect.set_focus') {
      state.sectFocus = cmd.focus;
      ok = true;
      message = `已将宗门培养倾向调为「${cmd.focus === 'alchemy' ? '重丹堂' : cmd.focus === 'combat' ? '重试剑' : '均衡养徒'}」。`;
    } else if (cmd.type === 'recruitment.open_session') {
      const r = openRecruitmentSession(state, cmd.regionId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'recruitment.audition') {
      const r = auditionCandidate(state, cmd.candidateId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'recruitment.invite') {
      const r = inviteCandidate(state, cmd.candidateId, cmd.seatTier, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = [...r.factIds];
      memberId = r.memberId;
      if (r.accepted) {
        factIds.push(...evaluateStandingBounties(state));
      }
    } else if (cmd.type === 'recruitment.auto_fill') {
      const r = autoFillRecruitment(state, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = [...r.factIds, ...evaluateStandingBounties(state)];
    } else if (cmd.type === 'member.depart') {
      const r = departMember(state, cmd.memberId, cmd.reason);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'member.rejoin') {
      const r = rejoinMember(state, cmd.memberId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'member.consume_pill') {
      const r = consumePillForMember(state, cmd.memberId, cmd.pillTemplateId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'mission.issue') {
      const r = issueMission(state, {
        commandId: cmd.commandId,
        recipientId: cmd.recipientId,
        targetType: cmd.targetType,
        rewardKind: cmd.rewardKind,
        rewardRounds: cmd.rewardRounds,
        deadlineTicks: cmd.deadlineTicks,
        abilityId: cmd.abilityId,
        rewardItemId: cmd.rewardItemId,
        rewardMethodId: cmd.rewardMethodId,
        includeHiddenReward: cmd.includeHiddenReward,
        source: 'player_bounty',
      });
      ok = r.ok;
      message = r.message;
      missionId = r.missionId;
      factIds = r.factIds;
    } else if (cmd.type === 'member.equip_weapon') {
      const r = equipWeaponFromVault(state, cmd.memberId, cmd.weaponId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'system.grant_ability') {
      const r = grantRuleAbility(state, {
        commandId: cmd.commandId,
        recipientId: cmd.recipientId,
        abilityId: cmd.abilityId,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'multi_causal.launch_tournament') {
      const r = launchMultiCausalTournament(state, {
        commandId: cmd.commandId,
        breakthroughHostId: cmd.breakthroughHostId,
        championHostId: cmd.championHostId,
        guardianElderId: cmd.guardianElderId,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'standing_bounty.create') {
      const r = createStandingBountyRule(state, {
        title: cmd.title,
        triggerCondition: cmd.triggerCondition,
        rewardKind: cmd.rewardKind,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'standing_bounty.toggle') {
      const r = toggleStandingBountyRule(state, cmd.ruleId, cmd.enabled);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'system.cast_miracle') {
      const r = castSystemMiracle(state, {
        commandId: cmd.commandId,
        miracleId: cmd.miracleId,
        targetMemberId: cmd.targetMemberId,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'system.toggle_auto_dispatch') {
      state.autoDispatchEnabled = cmd.enabled;
      ok = true;
      message = cmd.enabled
        ? '已开启「天道自动托管」：闲暇强将与圆满门人将自动领命破境、刷宝并踢馆强敌。'
        : '已关闭「天道自动托管」：改回纯手动点将派令模式。';
      const f = appendFact(state, {
        type: 'system.advanced',
        visibility: 'system_only',
        recipientId: null,
        actorIds: [],
        publicSummary: null,
        privateSummary: null,
        systemSummary: `【叮！托管模式切换】${message}`,
        cueTier: 'routine',
      });
      factIds = [f.id];
    } else if (cmd.type === 'sect.upgrade_spirit_vein') {
      const r = upgradeSpiritVein(state, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'treasury.open_mystery_box') {
      const r = openMysteryBox(state, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'treasury.exchange_stones') {
      const r = exchangeStonesToDaoyuan(state, cmd.commandId, cmd.tier);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'treasury.restock_herbs') {
      const r = restockHerbsWithStones(state, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'treasury.refine_weapon') {
      const r = refineEquippedWeapon(state, cmd.commandId, cmd.memberId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'system.resolve_encounter') {
      const r = resolveSectEncounter(state, cmd.commandId, cmd.encounterId, cmd.choice);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'member.mentor_disciple') {
      const r = mentorDisciple(state, cmd.commandId, cmd.apprenticeId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'scheme.execute') {
      const r = executeSystemScheme(state, {
        commandId: cmd.commandId,
        memberId: cmd.memberId,
        schemeKind: cmd.schemeKind,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'crisis.resolve_now') {
      const r = startLiveDuel(state, {
        commandId: cmd.commandId,
        kind: 'chapter_boss',
        challengerId: cmd.challengerMemberId,
      });
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'crisis.raid_outpost') {
      const r = raidCrisisOutpost(state, cmd.commandId, cmd.challengerMemberId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'duel.step') {
      const r = stepLiveDuel(state, cmd.commandId, cmd.mode);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'duel.cheat') {
      const r = applyDuelCheat(state, cmd.commandId, cmd.cheat);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'duel.close') {
      const r = closeLiveDuel(state, cmd.commandId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'perk.choose') {
      const r = chooseSystemPerk(state, cmd.commandId, cmd.perkId);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    } else if (cmd.type === 'clutch.resolve') {
      const r = resolvePendingClutch(state, cmd.commandId, cmd.clutchId, cmd.choice);
      ok = r.ok;
      message = r.message;
      factIds = r.factIds;
    }

    const receipt: CommandReceipt = {
      commandId: cmd.commandId,
      tick: state.tick,
      ok,
      message,
      memberId,
      missionId,
      factIds,
    };
    state.receipts[cmd.commandId] = receipt;
    receipts.push(receipt);
  }

  while (state.tick < targetTick) {
    if (state.activeDuel?.status === 'fighting' || state.pendingClutch) {
      break;
    }
    const prevTick = state.tick;
    stepSingleTick(state);
    if (state.tick <= prevTick) {
      break;
    }
  }

  return {
    state,
    newFacts: state.facts.filter((f) => f.seq >= startFactSeq),
    receipts,
  };
}
