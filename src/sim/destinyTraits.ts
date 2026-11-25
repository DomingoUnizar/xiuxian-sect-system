import { appendDramaScene, appendFact } from './facts';
import { createStreamRng } from './prng';
import type { DestinyTraitId, SystemPerkId, WorldState } from './types';

export interface DestinyTraitSpec {
  id: DestinyTraitId;
  name: string;
  rarity: 'gold' | 'violet' | 'jade';
  tag: string;
  desc: string;
}

export const DESTINY_TRAITS: Record<DestinyTraitId, DestinyTraitSpec> = {
  trait_moqi: {
    id: 'trait_moqi',
    name: '莫欺少年穷',
    rarity: 'gold',
    tag: '逆袭战魂',
    desc: '实况斗法半血以下伤害 +55%，若落败全宗额外领 +2 根基',
  },
  trait_sword_bone: {
    id: 'trait_sword_bone',
    name: '天生剑骨',
    rarity: 'gold',
    tag: '剑道天骄',
    desc: '实况斗法偶数回合追加一记凌厉剑气（伤害 +45%）',
  },
  trait_luck_son: {
    id: 'trait_luck_son',
    name: '天命气运子',
    rarity: 'gold',
    tag: '气运偏爱',
    desc: '对其施展幕后私令立返 +3 道源，斗法暴击率 +25%',
  },
  trait_reincarnate: {
    id: 'trait_reincarnate',
    name: '谪仙转世',
    rarity: 'gold',
    tag: '前世记忆',
    desc: '幕后私令修为收益 +35%，大境界突破把握 +18%',
  },
  trait_poison_body: {
    id: 'trait_poison_body',
    name: '百毒丹体',
    rarity: 'violet',
    tag: '以毒养战',
    desc: '斗法暗塞灵丹额外永久加 +28% 攻击，日常服丹多涨 +25 缕',
  },
  trait_involution: {
    id: 'trait_involution',
    name: '内卷狂魔',
    rarity: 'violet',
    tag: '不卷会死',
    desc: '双头拱火多涨 +60 缕修为，缔结死磕羁绊战力改为 +18',
  },
  trait_turtle: {
    id: 'trait_turtle',
    name: '苟道长生',
    rarity: 'violet',
    tag: '稳如老狗',
    desc: '实况斗法受击减伤 22%，且每回合开始自愈 6% 最大气血',
  },
  trait_thunder: {
    id: 'trait_thunder',
    name: '雷劫亲子',
    rarity: 'violet',
    tag: '天雷护体',
    desc: '实况斗法无视敌方 35% 防御，首合落雷震慑压低敌攻 15%',
  },
  trait_forge_soul: {
    id: 'trait_forge_soul',
    name: '剑器通灵',
    rarity: 'violet',
    tag: '人剑合一',
    desc: '实况斗法佩剑攻击加成翻倍，破招反击伤害额外 +35%',
  },
  trait_pill_savant: {
    id: 'trait_pill_savant',
    name: '丹火通明',
    rarity: 'jade',
    tag: '妙手丹心',
    desc: '每次对其施展「雪中送炭」顺手多炼出 1 枚二阶中品护脉丹入库',
  },
  trait_battle_mad: {
    id: 'trait_battle_mad',
    name: '越战越狂',
    rarity: 'jade',
    tag: '愈挫愈勇',
    desc: '实况斗法每过 1 合，自身攻击力叠加提升 +12%',
  },
  trait_sweet_talker: {
    id: 'trait_sweet_talker',
    name: '嘴甜讨喜',
    rarity: 'jade',
    tag: '迪化十级',
    desc: '「雪中送炭」额外多涨 +50 缕修为与 +5 心性',
  },
  trait_looter: {
    id: 'trait_looter',
    name: '雁过拔毛',
    rarity: 'jade',
    tag: '摸尸奇才',
    desc: '实况斗法获胜额外搜刮 +60 下品灵石与 +4 道源',
  },
  trait_iron_bone: {
    id: 'trait_iron_bone',
    name: '铜皮铁骨',
    rarity: 'jade',
    tag: '护身硬汉',
    desc: '实况斗法开场直接获得 25% 最大气血护盾',
  },
};

const ALL_TRAIT_IDS = Object.keys(DESTINY_TRAITS) as DestinyTraitId[];

function simpleHash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 纯哈希决定角色先天气运命格（不消耗任何 PRNG 流，保证旧测试种子 100% 稳定）。
 */
export function resolveEntityTraits(
  seed: number,
  entityId: string,
  rootGrade?: string,
): DestinyTraitId[] {
  if (entityId === 'member_master') return ['trait_turtle', 'trait_moqi'];
  if (entityId === 'member_alchemy_elder') return ['trait_pill_savant', 'trait_poison_body'];
  if (entityId === 'member_recruit_elder') return ['trait_sweet_talker', 'trait_iron_bone'];
  if (entityId === 'member_senior_disciple') return ['trait_sword_bone', 'trait_involution'];

  const h1 = simpleHash32(`${seed}:${entityId}:a`);
  const h2 = simpleHash32(`${seed}:${entityId}:b`);
  const goldPool: DestinyTraitId[] = ['trait_moqi', 'trait_sword_bone', 'trait_luck_son', 'trait_reincarnate'];
  const nonGoldPool = ALL_TRAIT_IDS.filter((id) => !goldPool.includes(id));

  let first: DestinyTraitId;
  if (rootGrade === '天品') {
    first = goldPool[h1 % goldPool.length];
  } else {
    first = ALL_TRAIT_IDS[h1 % ALL_TRAIT_IDS.length];
  }

  let second = nonGoldPool[h2 % nonGoldPool.length];
  if (second === first) {
    second = nonGoldPool[(h2 + 3) % nonGoldPool.length];
  }
  return [first, second];
}

export function getTraitSpec(id: DestinyTraitId): DestinyTraitSpec {
  return DESTINY_TRAITS[id];
}

export interface SystemPerkSpec {
  id: SystemPerkId;
  name: string;
  rarity: 'gold' | 'violet' | 'jade';
  tag: string;
  keyStats: string[];
  desc: string;
}

export const SYSTEM_PERKS: Record<SystemPerkId, SystemPerkSpec> = {
  perk_flying_swords: {
    id: 'perk_flying_swords',
    name: '万剑共鸣插件',
    rarity: 'gold',
    tag: '斗法输出',
    keyStats: ['斗法总伤害 +22%'],
    desc: '全宗实况斗法每回合追加山门剑气协同，总伤害 +22%',
  },
  perk_venom_protocol: {
    id: 'perk_venom_protocol',
    name: '丹毒破甲协议',
    rarity: 'violet',
    tag: '丹战联动',
    keyStats: ['削敌护甲 -30%', '灵丹回血 +25%'],
    desc: '实况斗法开场腐蚀敌方 30% 护甲，暗塞灵丹回血量再 +25%',
  },
  perk_gu_involution: {
    id: 'perk_gu_involution',
    name: '养蛊内卷法则',
    rarity: 'gold',
    tag: '拱火羁绊',
    keyStats: ['拱火仅耗 5 源', '羁绊攻 +10%'],
    desc: '双头拱火少花 3 点道源（只耗 5 点），且每段羁绊额外加斗法攻击 +10%',
  },
  perk_daoyuan_rebate: {
    id: 'perk_daoyuan_rebate',
    name: '天道回扣漏洞',
    rarity: 'gold',
    tag: '道源循环',
    keyStats: ['开挂/破招返 +2 源'],
    desc: '每次执行幕后私令或斗法破招，天道漏洞自动回扣返还 +2 道源',
  },
  perk_thorn_mirror: {
    id: 'perk_thorn_mirror',
    name: '护山反伤棱镜',
    rarity: 'jade',
    tag: '以守代攻',
    keyStats: ['反弹 35% 伤害'],
    desc: '实况斗法我方受击时，将 35% 伤害原样弹回敌人身上',
  },
  perk_desperate_fury: {
    id: 'perk_desperate_fury',
    name: '绝境爆种引擎',
    rarity: 'violet',
    tag: '残血翻盘',
    keyStats: ['半血暴击 +40%', '出招吸血 20%'],
    desc: '全宗门人半血以下暴击率 +40%，并且每次出招吸血 20%',
  },
  perk_soul_looter: {
    id: 'perk_soul_looter',
    name: '掠夺搜魂手',
    rarity: 'jade',
    tag: '以战养战',
    keyStats: ['胜场额外 +8 源', '+80 下品灵石'],
    desc: '每打赢一场实况对决，额外爆出 +8 道源与 +80 下品灵石',
  },
  perk_epiphany_halo: {
    id: 'perk_epiphany_halo',
    name: '顿悟暴击光环',
    rarity: 'violet',
    tag: '修为狂飙',
    keyStats: ['全宗修为 +35%'],
    desc: '全宗日常吐纳与幕后私令的修为收获永久再 +35%',
  },
  perk_steal_technique: {
    id: 'perk_steal_technique',
    name: '偷师拓印天眼',
    rarity: 'violet',
    tag: '越打越强',
    keyStats: ['每2合偷敌 12% 攻'],
    desc: '实况斗法每过 2 回合，窃取敌方 12% 当前攻击力加诸自身',
  },
  perk_mortal_rise: {
    id: 'perk_mortal_rise',
    name: '凡根逆命辐射',
    rarity: 'gold',
    tag: '废柴逆袭',
    keyStats: ['凡根攻防 +25%', '全体凡根 +80 修为'],
    desc: '凡品灵根弟子实况斗法攻防 +25%，获得此插件时全体凡根立涨 +80 缕修为',
  },
};

const ALL_PERK_IDS = Object.keys(SYSTEM_PERKS) as SystemPerkId[];

export function getSystemXpThreshold(level: number): number {
  return 60 + Math.max(0, level) * 25;
}

export function awardSystemXp(state: WorldState, xpGain: number): SystemPerkId[] | null {
  state.systemXp = (state.systemXp ?? 0) + Math.max(0, xpGain);
  state.systemLevel ??= 0;
  state.activePerks ??= [];

  const need = getSystemXpThreshold(state.systemLevel);
  if (state.systemXp < need || (state.pendingPerkChoices && state.pendingPerkChoices.length > 0)) {
    return null;
  }

  const remaining = ALL_PERK_IDS.filter((id) => !state.activePerks!.includes(id));
  if (remaining.length === 0) return null;

  const rng = createStreamRng(state.seed, 'perk_draft', `lv-${state.systemLevel}`, state.tick);
  const shuffled = rng.shuffle(remaining);
  const picked = shuffled.slice(0, Math.min(3, shuffled.length));
  state.pendingPerkChoices = picked;

  appendFact(state, {
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【叮！系统算力进阶 Lv.${state.systemLevel + 1}】已凝练出三枚天机外挂插件，请点击「外挂三选一」择优装载！`,
    cueTier: 'major',
  });
  return picked;
}

export function chooseSystemPerk(
  state: WorldState,
  _commandId: string,
  perkId: SystemPerkId,
): { ok: boolean; message: string; factIds: string[] } {
  const choices = state.pendingPerkChoices;
  if (!choices || choices.length === 0) {
    return { ok: false, message: '当前暂无待抽取的天机外挂插件。', factIds: [] };
  }
  if (!choices.includes(perkId)) {
    return { ok: false, message: '所选插件不在本轮三选一候选中。', factIds: [] };
  }

  state.activePerks ??= [];
  if (!state.activePerks.includes(perkId)) {
    state.activePerks.push(perkId);
  }
  const need = getSystemXpThreshold(state.systemLevel ?? 0);
  state.systemXp = Math.max(0, (state.systemXp ?? 0) - need);
  state.systemLevel = (state.systemLevel ?? 0) + 1;
  state.pendingPerkChoices = null;

  const spec = SYSTEM_PERKS[perkId];
  let extraNote = '';
  if (perkId === 'perk_mortal_rise') {
    let count = 0;
    for (const m of state.members) {
      if (m.status === 'active' && m.binding.bound && m.spiritRoot.grade === '凡品') {
        m.cultivation += 80;
        count += 1;
      }
    }
    extraNote = `（全宗 ${count} 位凡品灵根弟子齐齐灵台暴涨 +80 缕！）`;
  }

  const fact = appendFact(state, {
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【叮！外挂已装载「${spec.name}」】${spec.desc}${extraNote}`,
    cueTier: 'major',
  });

  const firstMember = state.members.find((m) => m.status === 'active' && m.binding.bound);
  if (firstMember) {
    appendDramaScene(state, {
      title: `天机插件 · ${spec.name}`,
      badge: `系统 Lv.${state.systemLevel}`,
      tone: 'scheme',
      actorId: firstMember.id,
      actorName: state.sectName,
      portraitId: firstMember.portraitId,
      beats: [
        `天枢主殿深处无声垂落一道玄秘光纹，系统底层法则悄然改写：「${spec.name}」正式激活！`,
        `${spec.desc}${extraNote}`,
      ],
      systemTruth: `你从三枚外挂插件里挑出最契合当下流派的「${spec.name}」，整座宗门从此永久吃到这条外挂红利。`,
      hostDelusion: `${firstMember.name} 忽然觉得山门灵气顺手了三成：「莫非是祖师爷在天之灵显圣、替我宗改了天地气数？」`,
      publicShock: `${state.sectName} 护山钟声无风轻鸣一声，众弟子只觉浑身舒泰，练功效率骤增！`,
    });
  }

  return {
    ok: true,
    message: `已装载天机外挂「${spec.name}」！${spec.desc}`,
    factIds: [fact.id],
  };
}
