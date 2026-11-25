import { appendFact, nextEntityId } from './facts';
import { applyCultivationDelta } from './cultivation';
import {
  consumePillForMember,
  grantRewardSlotIdempotent,
  releaseMissionReservations,
} from './missions';
import { computeMemberPowerScore } from './power';
import { createStreamRng } from './prng';
import type { BattleFact, BattleTurn, Mission, SectTournament, WorldState } from './types';

function createTournamentMission(
  state: WorldState,
  params: {
    commandId: string;
    tournamentId: string;
    recipientId: string;
    targetType: 'tournament_breakthrough' | 'tournament_champion' | 'tournament_guard';
    title: string;
    description: string;
    rounds: number;
    daoyuanCost: number;
    deadlineTicks: number;
  },
): { mission: Mission; factId: string } {
  const member = state.members.find((m) => m.id === params.recipientId)!;
  const missionId = nextEntityId(state, 'mission');
  state.daoyuanAvailable -= params.daoyuanCost;
  state.daoyuanReserved += params.daoyuanCost;
  state.reservations.push({
    id: nextEntityId(state, 'res'),
    missionId,
    slot: 'primary',
    kind: 'daoyuan',
    amount: params.daoyuanCost,
    status: 'reserved',
    createdAtTick: state.tick,
    resolvedAtTick: null,
  });

  const mission: Mission = {
    id: missionId,
    commandId: `${params.commandId}:${params.targetType}:${member.id}`,
    targetType: params.targetType,
    title: params.title,
    description: params.description,
    source: 'player_bounty',
    tournamentId: params.tournamentId,
    recipientId: member.id,
    issuedAtTick: state.tick,
    deadlineTick: state.tick + params.deadlineTicks,
    status: 'accepted',
    decisionReason: '宗门大比私令已接，各自暗中备战（不得向旁人透露半字）。',
    primaryReward: {
      slot: 'primary',
      kind: 'cultivation_rounds',
      label: `${params.rounds} 轮修为灌注`,
      rounds: params.rounds,
      daoyuanCost: params.daoyuanCost,
    },
    primarySettled: false,
    hiddenSettled: false,
    hiddenReleased: false,
    settledAtTick: null,
    relatedFactIds: [],
  };
  state.missions.push(mission);

  const fact = appendFact(state, {
    type: 'mission.issued',
    visibility: 'host_private',
    recipientId: member.id,
    actorIds: [member.id],
    missionId,
    publicSummary: null,
    privateSummary: `【叮！系统发布大比密令「${params.title}」】${params.description} 明奖：${params.rounds} 轮修为灌注。`,
    systemSummary: `多人因果大比私令：向 ${member.name} 私发「${params.title}」（预留 ${params.daoyuanCost} 道源）。`,
    cueTier: 'major',
  });
  mission.relatedFactIds.push(fact.id);
  return { mission, factId: fact.id };
}

/**
 * 9 点道统根基「多人因果」核心玩法：
 * 同一场宗门大比向甲（阵前破关）、乙（擂上夺魁）、护擂长老（护我门人）分别私发不同密令，
 * 彼此只见己令，按各自实际发生的事实独立结算。
 */
export function launchMultiCausalTournament(
  state: WorldState,
  params: {
    commandId: string;
    breakthroughHostId: string;
    championHostId: string;
    guardianElderId: string;
  },
): { ok: boolean; message: string; tournamentId?: string; factIds: string[] } {
  if (!state.unlockedPermissions.includes('multi_causal')) {
    return {
      ok: false,
      message: '尚未解锁「多人因果」权限（需道统根基达到 9 点：分火提清 +2、潮纹器道 +3、循铃御兽 +4）。',
      factIds: [],
    };
  }

  const uniqueIds = new Set([params.breakthroughHostId, params.championHostId, params.guardianElderId]);
  if (uniqueIds.size !== 3) {
    return {
      ok: false,
      message: '多人因果大比须分别指派三位互不相同的在籍宿主（甲、乙与护擂长老）。',
      factIds: [],
    };
  }

  const hostA = state.members.find((m) => m.id === params.breakthroughHostId && m.status === 'active' && m.binding.bound);
  const hostB = state.members.find((m) => m.id === params.championHostId && m.status === 'active' && m.binding.bound);
  const elder = state.members.find((m) => m.id === params.guardianElderId && m.status === 'active' && m.binding.bound);
  if (!hostA || !hostB || !elder) {
    return { ok: false, message: '所选三人均须为已绑定的在籍活跃门人。', factIds: [] };
  }

  const totalCost = 8 + 8 + 6;
  if (state.daoyuanAvailable < totalCost) {
    return {
      ok: false,
      message: `开启三方大比密令需预留 ${totalCost} 道源（当前可用 ${state.daoyuanAvailable}）。`,
      factIds: [],
    };
  }

  const tournamentId = nextEntityId(state, 'tourn');
  const mA = createTournamentMission(state, {
    commandId: params.commandId,
    tournamentId,
    recipientId: hostA.id,
    targetType: 'tournament_breakthrough',
    title: '阵前破关',
    description: `${hostA.name}，于大比开擂前冲破当前小关，临阵夯实根基。`,
    rounds: 10,
    daoyuanCost: 8,
    deadlineTicks: 6,
  });
  const mB = createTournamentMission(state, {
    commandId: params.commandId,
    tournamentId,
    recipientId: hostB.id,
    targetType: 'tournament_champion',
    title: '擂上夺魁',
    description: `${hostB.name}，在本届宗门大比决赛堂堂正正击败对手夺取头名。`,
    rounds: 12,
    daoyuanCost: 8,
    deadlineTicks: 8,
  });
  const mElder = createTournamentMission(state, {
    commandId: params.commandId,
    tournamentId,
    recipientId: elder.id,
    targetType: 'tournament_guard',
    title: '护我门人',
    description: `${elder.name}，亲自执掌大比护台阵旗，保交锋双方平安离台。`,
    rounds: 10,
    daoyuanCost: 6,
    deadlineTicks: 8,
  });

  const openFact = appendFact(state, {
    type: 'tournament.opened',
    visibility: 'public',
    recipientId: null,
    actorIds: [hostA.id, hostB.id, elder.id],
    publicSummary: `${state.sectName} 开启本届宗门论剑大比，由 ${elder.name} 执掌试剑台护阵，${hostA.name} 与 ${hostB.name} 入围决赛，各自闭关备战。`,
    privateSummary: null,
    systemSummary: `已于第 ${state.tick} 刻同步布局「多人因果」大比（${hostA.name} 破关 / ${hostB.name} 夺魁 / ${elder.name} 护擂），三份私令彼此隔离。`,
    cueTier: 'major',
  });

  state.tournaments ??= [];
  const tourn: SectTournament = {
    id: tournamentId,
    tickOpened: state.tick,
    prepResolveTick: state.tick + 2,
    duelResolveTick: state.tick + 4,
    phase: 'preparing',
    breakthroughHostId: hostA.id,
    championHostId: hostB.id,
    guardianElderId: elder.id,
    breakthroughMissionId: mA.mission.id,
    championMissionId: mB.mission.id,
    guardMissionId: mElder.mission.id,
  };
  state.tournaments.push(tourn);

  return {
    ok: true,
    message: `已向 ${hostA.name}、${hostB.name} 与 ${elder.name} 同刻签发三道大比密令，第 ${tourn.duelResolveTick} 刻试剑台见分晓。`,
    tournamentId,
    factIds: [mA.factId, mB.factId, mElder.factId, openFact.id],
  };
}

export function stepTournaments(state: WorldState): void {
  const tournaments = [...(state.tournaments ?? [])]
    .filter((t) => t.phase !== 'settled')
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const tourn of tournaments) {
    const hostA = state.members.find((m) => m.id === tourn.breakthroughHostId);
    const hostB = state.members.find((m) => m.id === tourn.championHostId);
    const elder = state.members.find((m) => m.id === tourn.guardianElderId);

    // 阶段一：甲阵前破关
    if (tourn.phase === 'preparing' && state.tick >= tourn.prepResolveTick) {
      const mA = state.missions.find((m) => m.id === tourn.breakthroughMissionId);
      if (hostA && hostA.status === 'active') {
        const supremePill = (state.inventory.pills.pill_humai_2_supreme ?? 0) > 0
          ? 'pill_humai_2_supreme'
          : (state.inventory.pills.pill_humai_2_high ?? 0) > 0
            ? 'pill_humai_2_high'
            : (state.inventory.pills.pill_humai_2_mid ?? 0) > 0
              ? 'pill_humai_2_mid'
              : null;
        if (supremePill && (hostA.cultivation < hostA.cultivationCap * 0.85 || hostA.injuries.length > 0)) {
          consumePillForMember(state, hostA.id, supremePill);
        }

        const rng = createStreamRng(state.seed, 'tournament', `${tourn.id}:prep`, 0);
        const prepScore = hostA.aptitude.comprehension + hostA.foundation * 5 + (hostA.cultivation >= 60 ? 15 : 0) + rng.nextInt(-3, 5);
        const succeeded = prepScore >= 55;
        tourn.breakthroughSucceeded = succeeded;

        if (succeeded) {
          hostA.realmLayer = Math.min(9, hostA.realmLayer + 1);
          hostA.cultivationCap += 20;
          applyCultivationDelta(hostA, 12);
          const btFact = appendFact(state, {
            type: 'tournament.breakthrough',
            visibility: 'public',
            recipientId: null,
            actorIds: [hostA.id],
            publicSummary: `大比开擂前夜，${hostA.name} 在洞府内顺势破关，晋入${hostA.realm}${hostA.realmLayer}层（战力 ${computeMemberPowerScore(hostA)}），次日仍如约登台！`,
            privateSummary: null,
            systemSummary: `多人因果第一响：${hostA.name} 大比前冲关成功（${hostA.realm}${hostA.realmLayer}层），当即结算「阵前破关」奖赏。`,
            cueTier: 'notable',
          });
          if (mA && mA.status === 'accepted') {
            mA.status = 'completed';
            mA.settledAtTick = state.tick;
            mA.relatedFactIds.push(btFact.id);
            grantRewardSlotIdempotent(state, mA, hostA, 'primary', btFact.id);
          }
        } else if (mA && mA.status === 'accepted') {
          mA.status = 'failed';
          mA.settledAtTick = state.tick;
          mA.decisionReason = '行气差半息未能临阵破关，预留道源释出。';
          releaseMissionReservations(state, mA, mA.decisionReason);
        }
      }
      tourn.phase = 'dueling';
    }

    // 阶段二：甲与乙大比决赛，长老护台收阵
    if (tourn.phase === 'dueling' && state.tick >= tourn.duelResolveTick) {
      const mB = state.missions.find((m) => m.id === tourn.championMissionId);
      const mElder = state.missions.find((m) => m.id === tourn.guardMissionId);

      if (hostA && hostB && hostA.status === 'active' && hostB.status === 'active') {
        const rng = createStreamRng(state.seed, 'tournament', `${tourn.id}:duel`, 0);
        const powerA = computeMemberPowerScore(hostA) + (hostA.equippedWeapon?.specialTrait === 'water_tide' ? 6 : 0);
        const powerB =
          computeMemberPowerScore(hostB) +
          (hostB.equippedWeapon?.specialTrait === 'water_tide' ? 6 : 0) +
          (hostB.grantedAbilities?.includes('ability_desperate_burst') ? 12 : 0);
        const rollB = rng.nextInt(-4, 5);
        const bWins = powerB + rollB >= powerA;

        const turns: BattleTurn[] = [
          {
            turn: 1,
            actorName: hostA.name,
            action: hostA.knownMethods.includes('method_qinglian_huifeng') ? '青莲回锋诀' : '试剑先手',
            detail: `${hostA.name} 挟破关余势先抢三剑（战力参照 ${powerA}），${hostB.name} 凝神格挡试探剑路。`,
            damage: 18,
            targetRemainingHp: Math.max(28, hostB.hp - 18),
          },
          {
            turn: 2,
            actorName: bWins ? hostB.name : hostA.name,
            action: bWins && hostB.equippedWeapon?.specialTrait === 'water_tide' ? '蓄潮回锋破势' : '定鼎一击',
            detail: bWins
              ? `${hostB.name} 看准换息破绽反扑压境${
                  hostB.equippedWeapon?.specialTrait === 'water_tide' ? '，储水回锋剑水纹清光大作' : ''
                }${hostB.grantedAbilities?.includes('ability_desperate_burst') ? '，气血急转反震逼退锋势' : ''}，终迫使 ${hostA.name} 收剑认负！`
              : `${hostA.name} 步步稳守终未露破绽，一式回撩压住 ${hostB.name} 剑脊赢得大比头名。`,
            damage: 24,
            targetRemainingHp: 26,
          },
        ];

        const winner = bWins ? hostB : hostA;
        const loser = bWins ? hostA : hostB;
        const elderSafe = Boolean(elder && elder.status === 'active');
        loser.hp = Math.max(24, loser.hp - 18);

        const shortReport = `${state.sectName} 大比决赛落幕：${winner.name} 击败 ${loser.name} 夺得头名，${
          elderSafe ? `${elder!.name} 挥旗收住余波护下二人平安离台。` : '双方点到即止各自收剑。'
        }`;
        const detailedReport = [
          `【大比阵列】战力比照：${hostB.name}(${powerB}) vs ${hostA.name}(${powerA})。`,
          ...turns.map((t) => `第${t.turn}合｜${t.detail}`),
          elderSafe ? `【护阵】${elder!.name} 及时合拢护擂阵光，二人均毫发无大碍。` : '',
          `【赛果】${shortReport}`,
        ]
          .filter(Boolean)
          .join('\n');

        const battleFactId = nextEntityId(state, 'bat');
        const bf: BattleFact = {
          id: battleFactId,
          tick: state.tick,
          mode: 'arena_duel',
          actorIds: [hostA.id, hostB.id, ...(elder ? [elder.id] : [])],
          contextAtStart: {
            hostPower: powerB,
            opponentPower: powerA,
            hostHp: hostB.maxHp,
            opponentHp: hostA.maxHp,
            weaponUsed: hostB.equippedWeapon?.name,
            environment: '宗门论剑大比决赛擂台',
          },
          seedRef: `${state.seed}:tournament:${tourn.id}:duel`,
          ruleVersion: state.rulesVersion,
          causes: [
            tourn.breakthroughSucceeded ? `${hostA.name} 阵前破关后携余势登台` : `${hostA.name} 稳守原境登台`,
            `${hostB.name} 战意充沛（战力 ${powerB} 对 ${powerA}）`,
          ],
          turns,
          outcome: bWins ? 'win' : 'retreat',
          deltas: { hostHpDelta: -12, durabilityDelta: 0, talismanConsumed: 0 },
          afterEffectIds: [],
          shortReport,
          detailedReport,
        };
        state.battleFacts[battleFactId] = bf;

        const duelFact = appendFact(state, {
          type: 'battle.finished',
          visibility: 'public',
          recipientId: null,
          actorIds: elderSafe ? [winner.id, loser.id, elder!.id] : [winner.id, loser.id],
          battleFactId,
          publicSummary: shortReport,
          privateSummary: null,
          systemSummary: `大比决赛落幕：胜者 ${winner.name}；${elderSafe ? `${elder!.name} 护台有功。` : ''}`,
          details: detailedReport,
          cueTier: 'major',
        });

        tourn.winnerId = winner.id;
        tourn.bothSafe = elderSafe;
        tourn.battleFactId = battleFactId;
        tourn.summary = shortReport;

        if (mB && mB.status === 'accepted') {
          if (winner.id === hostB.id) {
            mB.status = 'completed';
            mB.settledAtTick = state.tick;
            mB.relatedFactIds.push(duelFact.id);
            grantRewardSlotIdempotent(state, mB, hostB, 'primary', duelFact.id);
          } else {
            mB.status = 'failed';
            mB.settledAtTick = state.tick;
            mB.decisionReason = `${hostB.name} 在决赛惜败于 ${hostA.name}，未能夺魁（${hostA.name} 阵前破关已得奖赏不受影响）。预留 8 道源退回。`;
            releaseMissionReservations(state, mB, mB.decisionReason);
            const fFail = appendFact(state, {
              type: 'mission.expired',
              visibility: 'host_private',
              recipientId: hostB.id,
              actorIds: [hostB.id],
              missionId: mB.id,
              publicSummary: null,
              privateSummary: `决赛惜败于 ${hostA.name}，「${mB.title}」悬赏未竟。`,
              systemSummary: `宿主 ${hostB.name}「${mB.title}」未夺魁，已归还 8 道源预留（${hostA.name} 的破关奖励仍已保留）。`,
              cueTier: 'notable',
            });
            mB.relatedFactIds.push(fFail.id);
          }
        }

        if (mElder && mElder.status === 'accepted' && elder && elderSafe) {
          mElder.status = 'completed';
          mElder.settledAtTick = state.tick;
          mElder.relatedFactIds.push(duelFact.id);
          grantRewardSlotIdempotent(state, mElder, elder, 'primary', duelFact.id);
        }
      }

      tourn.phase = 'settled';
    }
  }
}
