import { getMethodById } from '../content/validate';
import { applyCultivationDelta } from './cultivation';
import { appendFact, nextEntityId } from './facts';
import { computeMemberPowerScore } from './power';
import { createStreamRng } from './prng';
import type { HostEquipment, Member, WorldState } from './types';

export interface SpiritVeinTierSpec {
  level: number;
  name: string;
  costLabel: string;
  costLow: number;
  costMid: number;
  costHigh: number;
  bonusDesc: string;
  caveAdd: number;
  meridianAdd: number;
  hpAdd: number;
  repAdd: number;
}

export const SPIRIT_VEIN_TIERS: SpiritVeinTierSpec[] = [
  {
    level: 1,
    name: '凡脉山门',
    costLabel: '初始自带',
    costLow: 0,
    costMid: 0,
    costHigh: 0,
    bonusDesc: '初始山门微薄灵脉（每届招贤 2 席）',
    caveAdd: 0,
    meridianAdd: 0,
    hpAdd: 0,
    repAdd: 0,
  },
  {
    level: 2,
    name: '聚灵洞天',
    costLabel: '80 下品灵石',
    costLow: 80,
    costMid: 0,
    costHigh: 0,
    bonusDesc: '全宗洞府供给 +3、经脉上限 +2、气血 +25；后续招贤扩至 3 席',
    caveAdd: 3,
    meridianAdd: 2,
    hpAdd: 25,
    repAdd: 20,
  },
  {
    level: 3,
    name: '紫府灵泉',
    costLabel: '220 下品灵石',
    costLow: 220,
    costMid: 0,
    costHigh: 0,
    bonusDesc: '全宗洞府供给 +4、经脉上限 +3、气血 +40；后续招贤扩至 4 席',
    caveAdd: 4,
    meridianAdd: 3,
    hpAdd: 40,
    repAdd: 35,
  },
  {
    level: 4,
    name: '金丹仙峰',
    costLabel: '3 中品灵石',
    costLow: 0,
    costMid: 3,
    costHigh: 0,
    bonusDesc: '全宗洞府供给 +6、经脉上限 +4、气血 +70；招贤高概率出地/天品苗子',
    caveAdd: 6,
    meridianAdd: 4,
    hpAdd: 70,
    repAdd: 60,
  },
  {
    level: 5,
    name: '太古圣地',
    costLabel: '2 上品灵石',
    costLow: 0,
    costMid: 0,
    costHigh: 2,
    bonusDesc: '全宗洞府供给 +10、经脉上限 +6、气血 +120；日常吐纳额外产出大道反哺',
    caveAdd: 10,
    meridianAdd: 6,
    hpAdd: 120,
    repAdd: 120,
  },
];

export function getSpiritVeinSpec(level = 1): SpiritVeinTierSpec {
  return SPIRIT_VEIN_TIERS.find((t) => t.level === level) ?? SPIRIT_VEIN_TIERS[0];
}

export function upgradeSpiritVein(
  state: WorldState,
  commandId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const curLevel = state.sectSpiritVeinLevel ?? 1;
  if (curLevel >= 5) {
    return { ok: false, message: '山门灵脉已升至最高阶「太古圣地」！', factIds: [] };
  }
  const nextSpec = getSpiritVeinSpec(curLevel + 1);
  const stones = state.inventory.spiritStones;
  if (stones.low < nextSpec.costLow || stones.mid < nextSpec.costMid || stones.high < nextSpec.costHigh) {
    return {
      ok: false,
      message: `灵石不足！升至「${nextSpec.name}」需 ${nextSpec.costLabel}。`,
      factIds: [],
    };
  }

  stones.low -= nextSpec.costLow;
  stones.mid -= nextSpec.costMid;
  stones.high -= nextSpec.costHigh;
  state.sectSpiritVeinLevel = nextSpec.level;
  state.sectReputation += nextSpec.repAdd;

  const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
  for (const m of actives) {
    m.caveSupplyPerRound += nextSpec.caveAdd;
    m.meridianCapPerRound += nextSpec.meridianAdd;
    m.manualRatePerRound = Math.max(m.manualRatePerRound + Math.ceil(nextSpec.meridianAdd / 2), m.meridianCapPerRound);
    m.maxHp += nextSpec.hpAdd;
    m.hp = Math.min(m.maxHp, m.hp + nextSpec.hpAdd);
  }

  state.ledger.push({
    id: `vein:${commandId}:${nextSpec.level}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: 'system',
    kind: 'foundation_gain',
    delta: 0,
    summary: `山门福地晋升「${nextSpec.name}」（消耗 ${nextSpec.costLabel}，全宗吐纳与气血上限暴涨）`,
  });

  const fact = appendFact(state, {
    type: 'world.phenomenon',
    visibility: 'public',
    recipientId: null,
    actorIds: actives.map((m) => m.id),
    publicSummary: `${state.sectName}聚拢海量灵石重构护山聚灵大阵，主峰灵脉轰然晋入「${nextSpec.name}」，护宗仙雾浓郁三倍！`,
    privateSummary: null,
    systemSummary: `【叮！福地升阶】${state.sectName}晋升为「${nextSpec.name}」（全宗吞吐 +${nextSpec.caveAdd}/+${nextSpec.meridianAdd}，气血上限 +${nextSpec.hpAdd}，声望 +${nextSpec.repAdd}）。`,
    cueTier: 'major',
  });

  return {
    ok: true,
    message: `🏛️ 山门福地晋升「${nextSpec.name}」！全宗每轮吞吐暴涨！`,
    factIds: [fact.id],
  };
}

const MYSTERY_WEAPON_POOL: Array<Omit<HostEquipment, 'id'>> = [
  {
    templateId: 'weapon_chaowen_sword',
    name: '玄光鉴镜',
    tier: '玄阶',
    quality: '上品',
    iconPath: 'assets/weapons/ma_tu_mirror_t02_006.png',
    durability: 70,
    maxDurability: 70,
    attackBonus: 58,
    defenseBonus: 24,
    specialTrait: 'water_tide',
  },
  {
    templateId: 'weapon_chaowen_sword',
    name: '惊涛镇海枪',
    tier: '地阶',
    quality: '上品',
    iconPath: 'assets/weapons/ma_tu_polearm_t04_011.png',
    durability: 100,
    maxDurability: 100,
    attackBonus: 126,
    defenseBonus: 46,
    specialTrait: 'water_tide',
  },
  {
    templateId: 'weapon_chaowen_sword',
    name: '天霜凤鸣扇',
    tier: '天阶',
    quality: '极品',
    iconPath: 'assets/weapons/fan_t03_011.png',
    durability: 150,
    maxDurability: 150,
    attackBonus: 256,
    defenseBonus: 96,
    specialTrait: 'water_tide',
  },
];

export function openMysteryBox(
  state: WorldState,
  commandId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const cost = 60;
  if (state.inventory.spiritStones.low < cost) {
    return {
      ok: false,
      message: `下品灵石不足（开启天机盲盒需 ${cost} 枚，当前 ${state.inventory.spiritStones.low} 枚）。`,
      factIds: [],
    };
  }

  state.inventory.spiritStones.low -= cost;
  const counterKey = 'mystery_box';
  const attempt = state.rngAttemptCounters[counterKey] ?? 0;
  state.rngAttemptCounters[counterKey] = attempt + 1;
  const rng = createStreamRng(state.seed, 'treasury', counterKey, attempt);
  const roll = rng.nextInt(1, 100);

  let rewardDesc = '';
  let publicRewardDesc = '';

  if (roll <= 25) {
    state.daoyuanAvailable += 32;
    state.inventory.spiritStones.low += 20;
    rewardDesc = '天机暴返 +32 道源并退回 20 下品灵石';
    publicRewardDesc = '一枚古朴灵玉简与二十块灵石';
  } else if (roll <= 50) {
    state.inventory.pills.pill_humai_2_supreme = (state.inventory.pills.pill_humai_2_supreme ?? 0) + 2;
    rewardDesc = '极品古丹匣：「二阶极品护脉丹 × 2」入库';
    publicRewardDesc = '两枚封蜡完好的极品护脉丹';
  } else if (roll <= 70) {
    state.inventory.materials = state.inventory.materials ?? {};
    state.inventory.materials.mat_chaowen_jade = (state.inventory.materials.mat_chaowen_jade ?? 0) + 3;
    state.inventory.herbs.mat_dew_petals = (state.inventory.herbs.mat_dew_petals ?? 0) + 2;
    state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 5;
    rewardDesc = '仙材大礼包：潮纹玉×3、带露玉髓花×2、护脉草×5';
    publicRewardDesc = '一筐灵韵充沛的奇珍药材与潮纹玉';
  } else if (roll <= 85) {
    state.inventory.spiritStones.mid += 2;
    rewardDesc = '中品灵石晶簇 × 2（折合二万下品灵石）入库';
    publicRewardDesc = '两块霞光流转的中品灵石';
  } else {
    const pickedTpl = MYSTERY_WEAPON_POOL[attempt % MYSTERY_WEAPON_POOL.length];
    const newWpn: HostEquipment = {
      ...pickedTpl,
      id: nextEntityId(state, 'wpn'),
      refineLevel: 0,
    };
    state.inventory.weapons.push(newWpn);
    rewardDesc = `稀世神兵出世！${newWpn.tier}${newWpn.quality}「${newWpn.name}」（攻+${newWpn.attackBonus}）已入百宝阁`;
    publicRewardDesc = `一柄寒芒凛冽的${newWpn.tier}古宝「${newWpn.name}」`;
  }

  state.ledger.push({
    id: `box:${commandId}:${attempt}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: 'system',
    kind: 'item_transfer',
    delta: 1,
    summary: `仙坊天机盲盒（耗 60 下品灵石）：开出「${rewardDesc}」`,
  });

  const fact = appendFact(state, {
    type: 'forging.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [],
    publicSummary: `外门执事自云游仙坊淘回一只古木秘匣，当众启封竟得${publicRewardDesc}！`,
    privateSummary: null,
    systemSummary: `【叮！天机盲盒开箱】耗 60 下品灵石，大爆：「${rewardDesc}」！`,
    details: `【启匣详情】消耗 60 枚下品灵石开启秘匣。\n【实得造化】${rewardDesc}。`,
    cueTier: 'major',
  });

  return {
    ok: true,
    message: `🔮 盲盒大爆！开出「${rewardDesc}」！`,
    factIds: [fact.id],
  };
}

export function exchangeStonesToDaoyuan(
  state: WorldState,
  commandId: string,
  tier: 'low' | 'mid' | 'high',
): { ok: boolean; message: string; factIds: string[] } {
  const table = {
    low: { cost: 100, label: '100 下品灵石', gain: 20, key: 'low' as const },
    mid: { cost: 1, label: '1 中品灵石', gain: 50, key: 'mid' as const },
    high: { cost: 1, label: '1 上品灵石', gain: 150, key: 'high' as const },
  }[tier];

  if (state.inventory.spiritStones[table.key] < table.cost) {
    return { ok: false, message: `灵石数量不足（需要 ${table.label}）。`, factIds: [] };
  }

  state.inventory.spiritStones[table.key] -= table.cost;
  state.daoyuanAvailable += table.gain;

  state.ledger.push({
    id: `exchange:${commandId}:${tier}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: 'system',
    kind: 'daoyuan_gain',
    delta: table.gain,
    summary: `灵石炼化：消耗 ${table.label}，转化 +${table.gain} 点可用道源`,
  });

  const fact = appendFact(state, {
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【叮！灵石熔炼完毕】消耗 ${table.label}，道源激增 +${table.gain}（现有 ${state.daoyuanAvailable}）！`,
    cueTier: 'major',
  });

  return {
    ok: true,
    message: `⚗️ 转化成功！+${table.gain} 点道源已到账！`,
    factIds: [fact.id],
  };
}

export function restockHerbsWithStones(
  state: WorldState,
  commandId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const cost = 40;
  if (state.inventory.spiritStones.low < cost) {
    return { ok: false, message: `下品灵石不足（批量采买灵草与玉材需 ${cost} 枚）。`, factIds: [] };
  }
  state.inventory.spiritStones.low -= cost;
  state.inventory.herbs.herb_ningling = (state.inventory.herbs.herb_ningling ?? 0) + 8;
  state.inventory.herbs.herb_huiqi = (state.inventory.herbs.herb_huiqi ?? 0) + 8;
  state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 6;
  state.inventory.materials = state.inventory.materials ?? {};
  state.inventory.materials.mat_chaowen_jade = (state.inventory.materials.mat_chaowen_jade ?? 0) + 2;

  const fact = appendFact(state, {
    type: 'herb.gathered',
    visibility: 'public',
    recipientId: null,
    actorIds: [],
    publicSummary: `宗门以四十块下品灵石向药市成批购入凝灵草×8、回气草×8、护脉草×6 与潮纹玉×2，丹房器堂物料充盈。`,
    privateSummary: null,
    systemSummary: `【百宝阁采买】耗 40 下品灵石补齐灵草+22株、潮纹玉+2。(${commandId})`,
    cueTier: 'notable',
  });

  return {
    ok: true,
    message: '🌿 已补入凝灵/回气/护脉草与潮纹玉！',
    factIds: [fact.id],
  };
}

export function refineEquippedWeapon(
  state: WorldState,
  commandId: string,
  memberId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === memberId && m.status === 'active' && m.binding.bound);
  if (!member || !member.equippedWeapon) {
    return { ok: false, message: '该门人尚未佩带可淬炼的本命法器。', factIds: [] };
  }
  const wpn = member.equippedWeapon;
  const curLv = wpn.refineLevel ?? 0;
  if (curLv >= 9) {
    return { ok: false, message: `「${wpn.name}」已淬炼至 +9 极境，锋芒无双！`, factIds: [] };
  }

  let paidLabel = '';
  if (state.inventory.spiritStones.low >= 80) {
    state.inventory.spiritStones.low -= 80;
    paidLabel = '80 下品灵石';
  } else if (state.inventory.spiritStones.mid >= 1) {
    state.inventory.spiritStones.mid -= 1;
    paidLabel = '1 中品灵石';
  } else {
    return { ok: false, message: '淬兵强化需 80 下品灵石或 1 中品灵石。', factIds: [] };
  }

  const beforePower = computeMemberPowerScore(member);
  wpn.refineLevel = curLv + 1;
  wpn.attackBonus += 22;
  wpn.defenseBonus += 10;
  wpn.maxDurability += 15;
  wpn.durability = wpn.maxDurability;
  const afterPower = computeMemberPowerScore(member);

  state.ledger.push({
    id: `refine:${commandId}:${wpn.id}:${wpn.refineLevel}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: member.id,
    kind: 'item_transfer',
    delta: wpn.refineLevel,
    summary: `淬兵强化「${wpn.name}」至 +${wpn.refineLevel}（耗 ${paidLabel}，战力 ${beforePower} → ${afterPower}）`,
  });

  const fact = appendFact(state, {
    type: 'forging.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    publicSummary: `${member.name} 在器堂引灵石之精十日反复打磨佩器「${wpn.name}」，令其锋芒大盛（+${wpn.refineLevel} 淬炼，战力 ${beforePower} → ${afterPower}）。`,
    privateSummary: null,
    systemSummary: `【叮！淬兵强化成功】消耗 ${paidLabel}，「${wpn.name}」升至 +${wpn.refineLevel}（${member.name} 战力 ${beforePower} → ${afterPower}）。`,
    details: `一锤定音：耗 ${paidLabel} 将灵矿熔入「${wpn.name}」。\n二锤淬锋：强化等级升至 +${wpn.refineLevel}（攻 ${wpn.attackBonus} / 防 ${wpn.defenseBonus}，耐久全满）。`,
    cueTier: 'major',
  });

  return {
    ok: true,
    message: `⚒️ 「${wpn.name} +${wpn.refineLevel}」淬炼成功！战力 ${beforePower} → ${afterPower}！`,
    factIds: [fact.id],
  };
}

export function pickBestMentorFor(state: WorldState, apprentice: Member): Member | null {
  const candidates = state.members.filter(
    (m) =>
      m.id !== apprentice.id &&
      m.status === 'active' &&
      m.binding.bound &&
      (computeMemberPowerScore(m) > computeMemberPowerScore(apprentice) ||
        m.knownMethods.some((km) => !apprentice.knownMethods.includes(km))),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => computeMemberPowerScore(b) - computeMemberPowerScore(a))[0];
}

export function mentorDisciple(
  state: WorldState,
  commandId: string,
  apprenticeId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const cost = 8;
  const apprentice = state.members.find(
    (m) => m.id === apprenticeId && m.status === 'active' && m.binding.bound,
  );
  if (!apprentice) {
    return { ok: false, message: '仅可对在籍活跃门人进行师徒传功提点。', factIds: [] };
  }
  const mentor = pickBestMentorFor(state, apprentice);
  if (!mentor) {
    return { ok: false, message: `${apprentice.name} 已独步当世、诸法皆通，暂无需前辈传功。`, factIds: [] };
  }
  if (state.daoyuanAvailable < cost) {
    return { ok: false, message: `师徒传功需 ${cost} 道源护脉，当前可用 ${state.daoyuanAvailable}。`, factIds: [] };
  }

  state.daoyuanAvailable -= cost;
  const beforePower = computeMemberPowerScore(apprentice);

  const methodOrder = [
    'method_jinglei_jue',
    'method_qinglian_huifeng',
    'method_chaoxi_guiyuan',
    'method_fenhuo_tiqing',
    'method_forging_fengwen',
    'method_beast_xunling',
    'method_basic_sword',
    'method_basic_fire',
  ];
  const newMethodId =
    methodOrder.find((mid) => mentor.knownMethods.includes(mid) && !apprentice.knownMethods.includes(mid)) ??
    mentor.knownMethods.find((mid) => !apprentice.knownMethods.includes(mid)) ??
    null;

  let methodLabel = '';
  if (newMethodId) {
    apprentice.knownMethods.push(newMethodId);
    const mDef = getMethodById(newMethodId);
    if (mDef) {
      methodLabel = `并授予《${mDef.name}》全卷`;
      apprentice.manualRatePerRound = Math.max(apprentice.manualRatePerRound, mDef.cultivationRate);
      if (newMethodId === 'method_basic_fire') apprentice.hasAlchemyFire = true;
    }
  }

  apprentice.foundation += 3;
  apprentice.aptitude.comprehension = Math.min(99, apprentice.aptitude.comprehension + 3);
  const cultChange = applyCultivationDelta(apprentice, 120);
  const afterPower = computeMemberPowerScore(apprentice);

  state.ledger.push({
    id: `mentor:${commandId}:${mentor.id}:${apprentice.id}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: apprentice.id,
    kind: 'cultivation_grant',
    delta: cultChange.delta,
    methodId: newMethodId ?? undefined,
    summary: `师徒薪火传功：${mentor.name} 点拨 ${apprentice.name} +${cultChange.delta} 缕修为${methodLabel}（战力 ${beforePower} → ${afterPower}）`,
  });

  const privFact = appendFact(state, {
    type: 'ability.granted',
    visibility: 'host_private',
    recipientId: apprentice.id,
    actorIds: [mentor.id, apprentice.id],
    publicSummary: null,
    privateSummary: `【叮！前辈薪火传功】${mentor.name} 亲自以精纯真元灌体提点，你的修为暴涨 +${cultChange.delta} 缕${methodLabel}（战力 ${beforePower} → ${afterPower}）！`,
    systemSummary: `【师徒传功】耗 ${cost} 道源由 ${mentor.name} 指点 ${apprentice.name}：修为 +${cultChange.delta} 缕${methodLabel}（战力 ${beforePower} → ${afterPower}）。`,
    cueTier: 'major',
  });

  const pubFact = appendFact(state, {
    type: 'cultivation.progressed',
    visibility: 'public',
    recipientId: null,
    actorIds: [mentor.id, apprentice.id],
    publicSummary: `前辈 ${mentor.name} 于藏经阁前亲自替 ${apprentice.name} 疏通奇经八脉${methodLabel}，令其当场连进修为（战力 ${beforePower} → ${afterPower}）！`,
    privateSummary: null,
    systemSummary: `公开传功实录已写入宗门纪事。`,
    cueTier: 'silent',
  });

  return {
    ok: true,
    message: `🎓 ${mentor.name} 传功完毕！${apprentice.name} 修为 +${cultChange.delta} 缕${methodLabel}！`,
    factIds: [privFact.id, pubFact.id],
  };
}
