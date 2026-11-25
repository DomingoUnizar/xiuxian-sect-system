import { REALMS } from './constants';
import { formatActionReport } from '../content/narrativePools';
import { appendFact, nextEntityId } from './facts';
import { computeMemberPowerScore, getArtifactMasteryFactor } from './power';
import { createStreamRng } from './prng';
import type { ArenaOpponent, BattleFact, BattleTurn, Member, WorldState } from './types';

export interface CombatRunOptions {
  mode: 'arena_duel' | 'wild_expedition';
  opponent?: ArenaOpponent;
  missionId?: string;
  /** 可选恶劣险境系数，供高风险样本或测试构造极端失败 */
  hazardModifier?: number;
}

export interface CombatAttemptResult {
  factId: string;
  battleFact: BattleFact;
  victory: boolean;
  hostDied: boolean;
}

/**
 * 文本战斗系统 V0.2 四段处理：战前读取 → 事件推演 → 结果与代价 → 文本呈现。
 * 简报与详报严格共用同一次结算的 BattleFact。
 */
export function runCombatEncounter(
  state: WorldState,
  host: Member,
  options: CombatRunOptions,
): CombatAttemptResult {
  const mode = options.mode;
  const opp: ArenaOpponent =
    options.opponent ??
    (mode === 'arena_duel'
      ? state.arenaOpponents[0]
      : {
          id: 'wild_wolf_01',
          name: '寒鸦岭玄角妖狼',
          title: '山外游荡一阶妖兽',
          realm: '炼气',
          realmLayer: 3,
          powerScore: 108 + (options.hazardModifier ?? 0),
          maxHp: 96 + (options.hazardModifier ?? 0) * 2,
          attack: 24 + Math.floor((options.hazardModifier ?? 0) / 3),
          defense: 9,
          evasion: 50,
          knownMethod: '妖风扑咬',
          available: true,
        });

  const counterKey = `battle:${host.id}:${opp.id}:${mode}`;
  const attemptIdx = state.rngAttemptCounters[counterKey] ?? 0;
  state.rngAttemptCounters[counterKey] = attemptIdx + 1;
  const rng = createStreamRng(state.seed, 'combat', counterKey, attemptIdx);

  const hostPower = computeMemberPowerScore(host);
  const weaponFactor = host.equippedWeapon
    ? getArtifactMasteryFactor(host.realm, host.equippedWeapon.tier)
    : 0;
  const weaponAttack = host.equippedWeapon ? Math.round(host.equippedWeapon.attackBonus * weaponFactor) : 0;
  const weaponDefense = host.equippedWeapon ? Math.round(host.equippedWeapon.defenseBonus * weaponFactor) : 0;

  const rootAttack = host.spiritRoot.grade === '天品' ? 10 : 0;
  const rootDefense = host.spiritRoot.grade === '天品' ? 4 : 0;
  const hasJinglei = host.knownMethods.includes('method_jinglei_jue');
  const hasQinglian = host.knownMethods.includes('method_qinglian_huifeng');
  const hasSword = host.knownMethods.includes('method_basic_sword');
  const hostBaseAttack =
    14 +
    Math.floor(host.cultivation / 15) +
    (hasJinglei ? 9 : hasQinglian ? 7 : hasSword ? 4 : 0) +
    weaponAttack +
    rootAttack;
  const hostDefense = 4 + Math.floor(host.aptitude.bone / 16) + weaponDefense + rootDefense;
  const realmAccuracyBonus = Math.max(0, REALMS.indexOf(host.realm) - 2) * 3;
  const hostAccuracy =
    51 +
    Math.floor(host.aptitude.comprehension / 15) +
    (hasJinglei ? 5 : hasSword ? 3 : 0) +
    realmAccuracyBonus +
    (host.spiritRoot.grade === '天品' ? 3 : 0);

  let startingHp = host.hp;
  let hostHp = host.hp;
  let oppHp = opp.maxHp;
  const turns: BattleTurn[] = [];
  const causes: string[] = [
    `双方纸面战力：${host.name} (${hostPower}) 对阵 ${opp.name} (${opp.powerScore})`,
  ];
  if (host.equippedWeapon) {
    causes.push(
      `佩戴「${host.equippedWeapon.name}」（${host.realm}催动${host.equippedWeapon.tier}法器发挥 ${Math.round(weaponFactor * 100)}% 威能${
        host.equippedWeapon.specialTrait === 'water_tide' ? '，储水剑格可放蓄潮剑气破防' : ''
      }）`,
    );
  }
  if (host.injuries.length > 0) {
    causes.push(`${host.name} 带伤上阵（${host.injuries.join('、')}）`);
  }

  const environment = mode === 'arena_duel' ? '宗门试剑台（同境切磋，禁私下致命）' : '山外寒鸦岭（荒野石滩，险境自担）';
  const maxRounds = opp.maxHp > 180 ? 8 : 5;
  let burstTriggered = false;

  for (let t = 1; t <= maxRounds && hostHp > 0 && oppHp > 0; t += 1) {
    // 宿主出手
    const roll = rng.nextInt(-2, 2);
    const hitScore = hostAccuracy + roll;
    if (hitScore >= opp.evasion) {
      const waterTideBonus = host.equippedWeapon?.specialTrait === 'water_tide' ? 4 : 0;
      const dmg = Math.max(4, hostBaseAttack + waterTideBonus + rng.nextInt(0, 4) - opp.defense);
      oppHp = Math.max(0, oppHp - dmg);
      const skillName = hasJinglei
        ? '惊雷破邪诀'
        : hasQinglian
          ? '青莲回锋诀'
          : hasSword
            ? '青松试剑势'
            : '徒手劲气';
      turns.push({
        turn: t,
        actorName: host.name,
        action: skillName,
        detail: `${host.name} 借「${skillName}」抢拍递出（准度 ${hitScore} ≥ 闪避 ${opp.evasion}），${
          waterTideBonus > 0 ? '剑格潮纹激出一息蓄潮剑气，' : ''
        }压破对手护势。`,
        damage: dmg,
        targetRemainingHp: oppHp,
      });
    } else {
      turns.push({
        turn: t,
        actorName: host.name,
        action: '试探虚招',
        detail: `${host.name} 一招微偏（${hitScore} < ${opp.evasion}），被 ${opp.name} 侧身避开。`,
        damage: 0,
        targetRemainingHp: oppHp,
      });
    }

    if (oppHp <= 0) {
      break;
    }

    // 对手还击
    const oppRoll = rng.nextInt(-2, 2);
    const oppDmg = Math.max(2, opp.attack + oppRoll - hostDefense);
    hostHp = Math.max(0, hostHp - oppDmg);
    turns.push({
      turn: t,
      actorName: opp.name,
      action: opp.knownMethod,
      detail: `${opp.name} 催动「${opp.knownMethod}」反扑，震伤 ${host.name} 气血 ${oppDmg} 点。`,
      damage: oppDmg,
      targetRemainingHp: hostHp,
    });

    if (
      !burstTriggered &&
      host.grantedAbilities?.includes('ability_desperate_burst') &&
      hostHp > 0 &&
      hostHp <= Math.floor(host.maxHp * 0.35) &&
      oppHp > 0
    ) {
      burstTriggered = true;
      const recoverHp = Math.floor(host.maxHp * 0.5);
      hostHp = Math.min(host.maxHp, hostHp + recoverHp);
      const burstDmg = Math.max(8, hostBaseAttack * 2 - opp.defense);
      oppHp = Math.max(0, oppHp - burstDmg);
      causes.push(`${host.name} 于低血险关激发「绝境爆发」，气血回涌 +${recoverHp} 并反斩 ${burstDmg} 点`);
      turns.push({
        turn: t,
        actorName: host.name,
        action: '绝境爆发·双连斩',
        detail: `${host.name} 跌入险线瞬间气血涌回 +${recoverHp}，连斩两剑直破对手 ${burstDmg} 点护持！`,
        damage: burstDmg,
        targetRemainingHp: oppHp,
      });
      if (oppHp <= 0) {
        break;
      }
    }

    // 同境切磋跌至低血线主动认输；谨慎性格在野外重伤线亦会果断撤离
    const retreatThreshold = mode === 'arena_duel' ? 18 : host.personality === '谨慎' ? 24 : 12;
    if (hostHp <= retreatThreshold && oppHp > 12) {
      causes.push(`${host.name} 气血跌至 ${hostHp}/${host.maxHp}，未恋战，依临场判断收招退场`);
      break;
    }
  }

  let outcome: BattleFact['outcome'];
  const victory = oppHp <= 0 || (mode === 'arena_duel' && hostHp > oppHp && oppHp < opp.maxHp * 0.45);
  let talismanConsumed = 0;
  let weaponProtected = false;
  let rescuedBy: string | undefined;
  let deathCause: string | undefined;
  let durabilityDelta = 0;

  if (victory) {
    const hpLost = host.hp - hostHp;
    outcome = hpLost <= 16 ? 'crushing_win' : hpLost <= 34 ? 'win' : 'close_win';
    host.hp = Math.max(20, hostHp);

    if (mode === 'arena_duel') {
      if (!host.hasWonFirstArena) {
        host.hasWonFirstArena = true;
      }
      host.unlockedArenaRematch = true;
      state.sectReputation += 2;
    } else {
      // 野外胜利采回灵草战利品
      const mistExtra = state.activePhenomenon?.kind === 'spring_mist_bloom' ? 1 : 0;
      state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 2 + mistExtra;
      state.inventory.herbs.herb_ningling = (state.inventory.herbs.herb_ningling ?? 0) + 2 + mistExtra;
      causes.push(
        `胜后收得寒鸦岭护脉草×${2 + mistExtra}、凝灵草×${2 + mistExtra}${mistExtra ? '（借灵雾天时多采一份）' : ''} 归宗入库`,
      );
    }
  } else {
    // 战败分支
    const severeFailure = mode === 'wild_expedition' && (hostHp <= 10 || (options.hazardModifier ?? 0) >= 20);
    if (!severeFailure) {
      outcome = 'retreat';
      host.hp = Math.max(16, hostHp);
      if (mode === 'arena_duel') {
        host.injuries = Array.from(new Set([...host.injuries, '试剑台切磋轻伤']));
        causes.push('同境切磋点到为止，拱手认输下台养伤');
      } else {
        host.injuries = Array.from(new Set([...host.injuries, '山野撤退外伤']));
        causes.push('野外遇挫后收势退回山门，暂需服丹或静养');
      }
    } else {
      // 严重失败或险境：先验宿主/宗门遁符脱身 → 再验法器护主受损 → 再验同门救援 → 仍不可免则身死留痕
      const escapeTalismans = (host.pouchTalismans ?? 0) + (state.inventory.talismans.talisman_escape ?? 0);
      if (escapeTalismans > 0) {
        if ((host.pouchTalismans ?? 0) > 0) {
          host.pouchTalismans -= 1;
        } else {
          state.inventory.talismans.talisman_escape = (state.inventory.talismans.talisman_escape ?? 1) - 1;
        }
        talismanConsumed = 1;
        outcome = 'heavy_defeat';
        host.hp = Math.max(15, hostHp);
        host.injuries = Array.from(new Set([...host.injuries, '强催遁符经脉震伤']));
        causes.push('危急时刻击碎宗门配发凡阶遁符×1 强行遁走保命');
      } else if (host.equippedWeapon && host.equippedWeapon.durability > 0) {
        weaponProtected = true;
        durabilityDelta = -Math.min(host.equippedWeapon.durability, 15);
        host.equippedWeapon.durability += durabilityDelta;
        outcome = 'heavy_defeat';
        host.hp = Math.max(12, hostHp);
        host.injuries = Array.from(new Set([...host.injuries, '法器碎裂震伤']));
        causes.push(`佩剑「${host.equippedWeapon.name}」自发护主挡下致命一击（器身耐久 ${durabilityDelta}）`);
      } else {
        const rescuer = state.members.find(
          (m) =>
            m.id !== host.id &&
            m.status === 'active' &&
            (m.id === 'member_senior_disciple' || m.role === 'elder') &&
            m.injuries.length === 0,
        );
        if (rescuer && (options.hazardModifier ?? 0) < 40) {
          rescuedBy = rescuer.name;
          outcome = 'heavy_defeat';
          host.hp = 14;
          host.injuries = Array.from(new Set([...host.injuries, '险境重创']));
          causes.push(`同门 ${rescuer.name} 赶赴山外接应，强行将其背回山门救治`);
        } else {
          outcome = 'host_died';
          host.hp = 0;
          host.status = 'dead';
          host.currentActivity = null;
          deathCause = `在${environment}遭遇${opp.name}重创，身边无遁符、法器亦无可援同门，力竭陨落。`;
          host.notes.push(`第 ${state.tick} 刻陨落：${deathCause}`);
          causes.push(deathCause);
        }
      }
    }
  }

  const battleFactId = nextEntityId(state, 'bat');

  const shortReport = victory
    ? mode === 'arena_duel'
      ? `${host.name} 登临试剑台迎战 ${opp.name}，数合交锋后占住先手赢下此局（剩余气血 ${host.hp}/${host.maxHp}），获准晋入下一场复赛/挑战席位。`
      : `${host.name} 于寒鸦岭击退 ${opp.name}，采回护脉草×2、凝灵草×2 平安归宗。`
    : outcome === 'host_died'
      ? `${host.name} 在${environment}不敌 ${opp.name}，重伤无援而陨落。`
      : `${host.name} 与 ${opp.name} 交锋失利（${causes[causes.length - 1]}），退回山门休整。`;

  const reportScene = mode === 'arena_duel' ? 'arena_clash' : 'wild_encounter';
  const peerName = rescuedBy ?? opp.name;
  const actionItem = talismanConsumed > 0 ? '凡阶遁符' : (host.equippedWeapon?.name ?? '长剑');
  const midTag = turns.some((x) => x.damage === 0) ? 'dodge' : 'clash';
  const endTag = talismanConsumed > 0 ? 'talisman_save' : rescuedBy ? 'rescue' : victory ? 'success' : 'fail';
  const reportSalt = `${state.seed}:${counterKey}:${attemptIdx}`;
  const liveWarmup = formatActionReport(
    reportScene,
    'warmup',
    { actor: host.name, peer: peerName, item: actionItem },
    reportSalt,
  );
  const liveMid = formatActionReport(
    reportScene,
    midTag,
    { actor: host.name, peer: peerName, item: actionItem },
    reportSalt,
  );
  const liveEnd = formatActionReport(
    reportScene,
    endTag,
    { actor: host.name, peer: peerName, item: actionItem },
    reportSalt,
  );

  const detailedReport = [
    `【战前】${causes.join('；')}。`,
    ...turns.map((x) => `第${x.turn}合｜${x.detail}`),
    `【现场白描】${liveWarmup} ${liveMid} ${liveEnd}`,
    `【结局】${shortReport}`,
  ].join('\n');

  const battleFact: BattleFact = {
    id: battleFactId,
    tick: state.tick,
    mode,
    actorIds: [host.id],
    contextAtStart: {
      hostPower,
      opponentPower: opp.powerScore,
      hostHp: host.maxHp,
      opponentHp: opp.maxHp,
      weaponUsed: host.equippedWeapon?.name,
      environment,
    },
    seedRef: `${state.seed}:combat:${counterKey}:${attemptIdx}`,
    ruleVersion: state.rulesVersion,
    causes,
    turns,
    outcome,
    deltas: {
      hostHpDelta: host.hp - startingHp,
      durabilityDelta,
      talismanConsumed,
      rescuedBy,
      weaponProtected,
      deathCause,
    },
    afterEffectIds: [],
    shortReport,
    detailedReport,
  };
  state.battleFacts[battleFactId] = battleFact;

  const mainFact = appendFact(state, {
    type: outcome === 'host_died' ? 'member.died' : 'battle.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [host.id],
    missionId: options.missionId,
    publicSummary: shortReport,
    privateSummary: null,
    systemSummary: `${host.name} 战斗结算 [${outcome}]：${shortReport}`,
    details: detailedReport,
    battleFactId,
    cueTier: outcome === 'host_died' || victory ? 'notable' : 'routine',
  });

  return {
    factId: mainFact.id,
    battleFact,
    victory,
    hostDied: outcome === 'host_died',
  };
}
