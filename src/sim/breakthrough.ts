import type { Realm } from './constants';
import { appendFact } from './facts';
import { computeMemberPowerScore } from './power';
import { createStreamRng } from './prng';
import type { Member, WorldState } from './types';

export function getNextMajorRealm(realm: Realm): Realm | null {
  if (realm === '炼气') return '筑基';
  if (realm === '筑基') return '紫府';
  if (realm === '紫府') return '金丹';
  if (realm === '金丹') return '元婴';
  if (realm === '元婴') return '出窍';
  if (realm === '出窍') return '化神';
  if (realm === '化神') return '炼虚';
  if (realm === '炼虚') return '合体';
  if (realm === '合体') return '大乘';
  if (realm === '大乘') return '渡劫';
  if (realm === '渡劫') return '无漏';
  return null;
}

const BREAKTHROUGH_GAIN_BY_TARGET: Partial<
  Record<Realm, { hp: number; qi: number; cave: number; meridian: number; lifespan: number; rep: number; daoyuan: number }>
> = {
  筑基: { hp: 48, qi: 38, cave: 3, meridian: 2, lifespan: 600, rep: 8, daoyuan: 10 },
  紫府: { hp: 85, qi: 68, cave: 4, meridian: 3, lifespan: 900, rep: 14, daoyuan: 16 },
  金丹: { hp: 140, qi: 110, cave: 5, meridian: 4, lifespan: 1500, rep: 22, daoyuan: 24 },
  元婴: { hp: 220, qi: 175, cave: 7, meridian: 6, lifespan: 2500, rep: 32, daoyuan: 36 },
  出窍: { hp: 310, qi: 245, cave: 9, meridian: 7, lifespan: 3500, rep: 45, daoyuan: 48 },
  化神: { hp: 420, qi: 320, cave: 11, meridian: 9, lifespan: 5000, rep: 60, daoyuan: 64 },
  炼虚: { hp: 580, qi: 440, cave: 14, meridian: 11, lifespan: 7000, rep: 85, daoyuan: 88 },
  合体: { hp: 780, qi: 590, cave: 18, meridian: 14, lifespan: 10000, rep: 110, daoyuan: 120 },
  大乘: { hp: 1050, qi: 780, cave: 22, meridian: 17, lifespan: 15000, rep: 150, daoyuan: 160 },
  渡劫: { hp: 1400, qi: 1020, cave: 28, meridian: 21, lifespan: 25000, rep: 220, daoyuan: 220 },
  无漏: { hp: 2200, qi: 1600, cave: 40, meridian: 30, lifespan: 90000, rep: 400, daoyuan: 360 },
};

export function isAtRealmPeak(
  member: Pick<Member, 'realm' | 'realmLayer' | 'cultivation' | 'cultivationCap'>,
): boolean {
  return (
    getNextMajorRealm(member.realm) !== null &&
    member.realmLayer >= 9 &&
    member.cultivation >= member.cultivationCap
  );
}

export interface BreakthroughEstimate {
  chance: number;
  nextRealm: Realm | null;
  hasHumaiBoost: boolean;
  reasons: string[];
}

export function estimateBreakthroughChance(
  state: Pick<WorldState, 'inventory' | 'activePhenomenon'>,
  member: Member,
): BreakthroughEstimate {
  const nextRealm = getNextMajorRealm(member.realm);
  if (!nextRealm) {
    return { chance: 0, nextRealm: null, hasHumaiBoost: false, reasons: ['已达当前开放大境上限'] };
  }

  const reasons: string[] = [];
  let chance =
    28 +
    member.foundation * 2 +
    Math.floor((member.aptitude.mindset - 50) * 0.45) +
    Math.floor((member.aptitude.bone - 50) * 0.3);
  reasons.push(`根基(${member.foundation})与心性根骨底数 ${chance}%`);

  if (state.activePhenomenon?.kind === 'spirit_tide') {
    chance += 15;
    reasons.push('灵潮夜涌天时护持 +15%');
  }

  const hasHumaiInVault =
    (state.inventory.pills.pill_humai_2_supreme ?? 0) > 0 ||
    (state.inventory.pills.pill_humai_2_high ?? 0) > 0 ||
    (state.inventory.pills.pill_humai_2_mid ?? 0) > 0;
  const recentHumaiNote = member.notes.some((n) => n.includes('护脉丹'));
  const hasHumaiBoost = hasHumaiInVault || recentHumaiNote;
  if (hasHumaiBoost) {
    chance += 22;
    reasons.push(recentHumaiNote ? '先前所服护脉丹药力护脉 +22%' : '宗库备有护脉丹护脉 +22%');
  }

  if ((member.grantedAbilities?.length ?? 0) > 0 || member.knownMethods.includes('method_chaoxi_guiyuan')) {
    chance += 10;
    reasons.push('玄功或护道神通稳住真元 +10%');
  }

  if (member.spiritRoot.grade === '天品') {
    chance += 18;
    reasons.push('天品仙根契合大道 +18%');
  } else if (member.spiritRoot.grade === '地品') {
    chance += 6;
    reasons.push('地品灵根纳气澄明 +6%');
  }

  if (member.injuries.length > 0) {
    const pen = member.injuries.length * 18;
    chance -= pen;
    reasons.push(`带伤(${member.injuries.length}处)滞涩行气 -${pen}%`);
  }

  if (member.pillToxicity > 3) {
    const toxPen = (member.pillToxicity - 3) * 5;
    chance -= toxPen;
    reasons.push(`残余丹毒(${member.pillToxicity})阻脉 -${toxPen}%`);
  }

  return {
    chance: Math.max(10, Math.min(95, Math.round(chance))),
    nextRealm,
    hasHumaiBoost,
    reasons,
  };
}

export interface BreakthroughOutcome {
  ok: boolean;
  succeeded: boolean;
  factId: string;
  previousRealm: Realm;
  newRealm: Realm;
  steps: string[];
  chanceUsed: number;
}

/**
 * 大境界突破实战推演（炼气九层圆满→筑基→紫府→金丹→元婴→化神）：
 * 产出四拍冲关过程、真实修为/寿元/气血上限蜕变或受挫留伤，并生成可公开纪事。
 */
export function runRealmBreakthrough(
  state: WorldState,
  member: Member,
  missionId?: string,
  options?: { guaranteedByMiracle?: boolean },
): BreakthroughOutcome {
  const prevRealm = member.realm;
  const est = estimateBreakthroughChance(state, member);
  const nextRealm = est.nextRealm;
  if (!nextRealm || !isAtRealmPeak(member)) {
    return {
      ok: false,
      succeeded: false,
      factId: '',
      previousRealm: prevRealm,
      newRealm: prevRealm,
      steps: ['尚未修至当前大境九层圆满，还不到引气冲关之际。'],
      chanceUsed: est.chance,
    };
  }

  const guaranteed = Boolean(options?.guaranteedByMiracle);
  const effectiveChance = guaranteed ? 100 : est.chance;

  // 若先前尚未服过护脉丹且丹库有存药，临闭关自动领用一枚护脉丹护持心脉
  let consumedHumaiName: string | null = null;
  if (!guaranteed && !member.notes.some((n) => n.includes('护脉丹'))) {
    const pillOrder = [
      ['pill_humai_2_mid', '二阶中品护脉丹'],
      ['pill_humai_2_high', '二阶上品护脉丹'],
      ['pill_humai_2_supreme', '二阶极品护脉丹'],
    ] as const;
    for (const [pid, label] of pillOrder) {
      if ((state.inventory.pills[pid] ?? 0) > 0) {
        state.inventory.pills[pid] -= 1;
        consumedHumaiName = label;
        member.notes.push(`冲关前领服「${label}」稳住经脉`);
        break;
      }
    }
  }

  const rng = createStreamRng(state.seed, 'breakthrough', `${member.id}:${state.tick}`, 0);
  const roll = rng.nextInt(1, 100);
  const succeeded = guaranteed || roll <= est.chance;
  const beforePower = computeMemberPowerScore(member);
  const beforeCap = member.cultivationCap;

  const step1 = `一息聚气：${member.name} 于静室八卦阵前敛神，九层圆满真气化作漩涡沉入丹田。`;
  const step2 = guaranteed
    ? `二息开脉：无形仙机垂落护脉定神，${nextRealm}大境壁垒应声裂开百丈清光！`
    : consumedHumaiName
      ? `二息开脉：服下${consumedHumaiName}化开温润药气，硬顶大境壁垒第一重反震！`
      : state.activePhenomenon?.kind === 'spirit_tide'
        ? `二息开脉：借山门灵潮夜涌引天外清气贯脉，滞涩关窍齐声洞开。`
        : `二息开脉：独凭自身${member.foundation}点根基强撞${nextRealm}壁垒，筋骨作响。`;

  if (succeeded) {
    const overflow = Math.max(0, Math.min(40, member.cultivation - beforeCap));
    const gain = BREAKTHROUGH_GAIN_BY_TARGET[nextRealm] ?? {
      hp: 48,
      qi: 38,
      cave: 3,
      meridian: 2,
      lifespan: 600,
      rep: 8,
      daoyuan: 10,
    };
    member.realm = nextRealm;
    member.realmLayer = 1;
    member.cultivation = overflow;
    member.cultivationCap = Math.round(beforeCap * 1.65);
    member.foundation += 5;
    member.maxHp += gain.hp;
    member.hp = member.maxHp;
    member.maxQi += gain.qi;
    member.qi = member.maxQi;
    member.caveSupplyPerRound += gain.cave;
    member.meridianCapPerRound += gain.meridian;
    member.manualRatePerRound = Math.max(member.manualRatePerRound, member.meridianCapPerRound);
    member.lifespanYears += gain.lifespan;
    member.injuries = member.injuries.filter((i) => i !== '冲关经脉震荡');
    member.notes.push(
      `第 ${state.tick} 刻成功破入${nextRealm}1层（${guaranteed ? '天意护持稳破' : `契机判定 ${roll} ≤ ${est.chance}%`}）`,
    );

    const afterPower = computeMemberPowerScore(member);
    state.sectReputation += gain.rep;
    state.daoyuanAvailable += gain.daoyuan;

    const step3 = `三息行气：气血真元液化奔涌四肢百骸，旧日凡尘浊气尽数排出体外。`;
    const step4 = `四息凝道：灵台大亮！${member.name} 正式破入「${nextRealm}1层」（战力 ${beforePower} → ${afterPower}，寿元再延 ${gain.lifespan} 载）！`;
    const steps = [step1, step2, step3, step4];

    const fact = appendFact(state, {
      type: 'member.breakthrough',
      visibility: 'public',
      recipientId: null,
      actorIds: [member.id],
      missionId,
      publicSummary: `${member.name} 于静室闭关引气，一举破开大境桎梏晋入${nextRealm}1层（战力 ${beforePower} → ${afterPower}），山门灵光冲霄三丈！`,
      privateSummary: null,
      systemSummary: `破境捷报：${member.name} 晋入${nextRealm}1层（${guaranteed ? '立地破境必成' : `判定 ${roll}/${est.chance}%`}），宗门声望 +${gain.rep}，额外反哺 +${gain.daoyuan} 道源。`,
      details: `${steps.join('\n')}\n【成算依据】${guaranteed ? '仙机护脉直破（100%）' : est.reasons.join('；')}`,
      cueTier: 'major',
    });

    return {
      ok: true,
      succeeded: true,
      factId: fact.id,
      previousRealm: prevRealm,
      newRealm: nextRealm,
      steps,
      chanceUsed: effectiveChance,
    };
  }

  // 冲关受挫：不致死，留存八成半修为并给出破局指引
  member.cultivation = Math.floor(beforeCap * 0.85);
  member.hp = Math.max(18, Math.floor(member.maxHp * 0.55));
  member.injuries = Array.from(new Set([...member.injuries, '冲关经脉震荡']));

  const advice = !est.hasHumaiBoost
    ? '行气第三转负荷偏重，若先炼制或赐服护脉丹、或候灵潮夜涌再冲定可功成'
    : '灵海收束略差一息火候，养妥经脉后再积满灵气便可再叩大关';
  const step3 = `三息行气：行气至第三转真元骤然溃散，经脉微震、气血回落至 ${member.hp}/${member.maxHp}。`;
  const step4 = `四息收功：${member.name} 及时收束心神保住八成半修为出关（${advice}）。`;
  const steps = [step1, step2, step3, step4];

  const fact = appendFact(state, {
    type: 'member.breakthrough',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    missionId,
    publicSummary: `${member.name} 尝试冲关${nextRealm}未竟，收势保住八成半修为出关调养（${advice}）。`,
    privateSummary: null,
    systemSummary: `破境暂挫：${member.name} 冲${nextRealm}未成（掷数 ${roll} > ${est.chance}%），${advice}。`,
    details: `${steps.join('\n')}\n【成算依据】${est.reasons.join('；')}`,
    cueTier: 'notable',
  });

  return {
    ok: true,
    succeeded: false,
    factId: fact.id,
    previousRealm: prevRealm,
    newRealm: prevRealm,
    steps,
    chanceUsed: est.chance,
  };
}
