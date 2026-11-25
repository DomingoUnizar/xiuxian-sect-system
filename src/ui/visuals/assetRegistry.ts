import type { ItemQuality } from '../../sim/constants';
import type { ArenaOpponent, Candidate, HostEquipment, Member } from '../../sim/types';

export type RarityFrameKey = 'wood' | 'bronze' | 'jade' | 'amethyst' | 'dragon' | 'phoenix';

export const RARITY_FRAME_MAP: Record<RarityFrameKey, string> = {
  wood: 'assets/ui/item_t1_wood_128.png',
  bronze: 'assets/ui/item_t2_bronze_128.png',
  jade: 'assets/ui/item_t3_jade_128.png',
  amethyst: 'assets/ui/item_t4_amethyst_128.png',
  dragon: 'assets/ui/item_t5_dragon_128.png',
  phoenix: 'assets/ui/item_t6_phoenix_128.png',
};

const STANDEE_IDS = [
  'boy_0',
  'boy_1',
  'boy_2',
  'girl_0',
  'girl_1',
  'girl_2',
  'young_man_0',
  'young_man_1',
  'young_man_2',
  'young_female_0',
  'young_female_1',
  'young_female_2',
  'mid_male_0',
  'mid_male_1',
  'mid_female_0',
  'mid_female_1',
  'old_male_0',
  'old_female_0',
] as const;

export const FULL_WEAPON_CATALOG: Array<{
  category: string;
  label: string;
  iconPath: string;
  rarity: RarityFrameKey;
}> = [
  { category: '飞剑', label: '青锋灵剑', iconPath: 'assets/weapons/sword_t02_006.png', rarity: 'jade' },
  { category: '法印', label: '丹火阵印', iconPath: 'assets/weapons/seal_t02_004.png', rarity: 'bronze' },
  { category: '灵铃', label: '清心铃铛', iconPath: 'assets/weapons/bell_t01_001.png', rarity: 'wood' },
  { category: '仙扇', label: '青竹灵扇', iconPath: 'assets/weapons/fan_t02_006.png', rarity: 'jade' },
  { category: '古琴', label: '松风七弦', iconPath: 'assets/weapons/instrument_t02_006.png', rarity: 'jade' },
  { category: '宝镜', label: '玄光鉴镜', iconPath: 'assets/weapons/ma_tu_mirror_t02_006.png', rarity: 'amethyst' },
  { category: '禅杖', label: '灵木法杖', iconPath: 'assets/weapons/ma_tu_staff_t02_006.png', rarity: 'bronze' },
  { category: '灵刀', label: '玄铁长刀', iconPath: 'assets/weapons/ma_tu_saber_t02_006.png', rarity: 'bronze' },
  { category: '长枪', label: '破阵长戈', iconPath: 'assets/weapons/ma_tu_polearm_t02_006.png', rarity: 'jade' },
  { category: '劲弓', label: '流风灵弓', iconPath: 'assets/weapons/bow_t02_006.png', rarity: 'bronze' },
  { category: '重斧', label: '裂石玄斧', iconPath: 'assets/weapons/axe_t02_006.png', rarity: 'bronze' },
  { category: '拳套', label: '铁骨拳甲', iconPath: 'assets/weapons/gauntlet_t02_006.png', rarity: 'wood' },
];

export const ITEM_ICON_MAP: Record<string, { iconPath: string; rarity: RarityFrameKey }> = {
  herb_ningling: { iconPath: 'assets/icons/botanical-01.png', rarity: 'wood' },
  herb_huiqi: { iconPath: 'assets/icons/botanical-03.png', rarity: 'wood' },
  herb_humai: { iconPath: 'assets/icons/botanical-02.png', rarity: 'bronze' },
  pill_ningling_1_low: { iconPath: 'assets/icons/pills-01.png', rarity: 'wood' },
  pill_ningling_1_mid: { iconPath: 'assets/icons/pills-02.png', rarity: 'bronze' },
  pill_humai_2_mid: { iconPath: 'assets/icons/pills-03.png', rarity: 'jade' },
  pill_humai_2_high: { iconPath: 'assets/icons/elixirs-01.png', rarity: 'amethyst' },
  talisman_escape: { iconPath: 'assets/icons/talismans-01.png', rarity: 'bronze' },
  weapon_iron_sword: { iconPath: 'assets/weapons/sword_t01_001.png', rarity: 'wood' },
  furnace_mortal: { iconPath: 'assets/icons/relics-01.png', rarity: 'bronze' },
  spirit_stone: { iconPath: 'assets/icons/jewels-01.png', rarity: 'dragon' },
  heritage_scroll: { iconPath: 'assets/icons/manuals-02.png', rarity: 'phoenix' },
};

export const REGION_SCENE_MAP: Record<string, { scenePath: string; badge: string }> = {
  zhongzhou: { scenePath: 'assets/scenes/04_celestial_palace.webp', badge: '仙朝大试 · 人才济济' },
  dongyu: { scenePath: 'assets/scenes/22_peach_blossom_stream.webp', badge: '东域坊市 · 匠修云集' },
  nanjiang: { scenePath: 'assets/scenes/21_herb_valley.webp', badge: '南疆药谷 · 识药擅火' },
  beihuang: { scenePath: 'assets/scenes/08_sword_tomb.webp', badge: '北荒试锋 · 剑骨体魄' },
  ximo: { scenePath: 'assets/scenes/06_bronze_gate.webp', badge: '西漠古坊 · 重诺游方' },
};

function stableHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function resolvePortraitUrl(portraitId: string): string {
  if (portraitId.startsWith('beast_')) return `assets/beasts/${portraitId}.png`;
  if (portraitId.startsWith('demonic_')) return `assets/cultivators/${portraitId}.png`;
  if (portraitId.startsWith('mortal_')) return `assets/wanderers/${portraitId}.png`;
  return `assets/portraits/${portraitId}.png`;
}

/**
 * 注意：`assets/standees/*` 与 `assets/npc-icons/*` 为城镇/过场 NPC 专用 2D 素材，
 * 严禁绑定给宗门成员（`Member`）或招贤弟子候选（`RecruitmentCandidate`）。
 */
export function resolveStandeeId(entity: {
  id: string;
  role?: string;
  ageYears?: number;
  originRegionId?: string;
  hasAlchemyFire?: boolean;
}): (typeof STANDEE_IDS)[number] {
  if (entity.id === 'member_master') return 'mid_male_0';
  if (entity.id === 'member_alchemy_elder') return 'old_female_0';
  if (entity.id === 'member_recruit_elder') return 'old_male_0';
  if (entity.id === 'member_senior_disciple') return 'young_man_0';
  if (entity.id === 'member_departed_01') return 'mid_female_1';

  const h = stableHash(entity.id);
  const age = entity.ageYears ?? 19;
  if (age >= 60) return h % 2 === 0 ? 'old_male_0' : 'old_female_0';
  if (age >= 35) {
    const midPool = ['mid_male_0', 'mid_male_1', 'mid_female_0', 'mid_female_1'] as const;
    return midPool[h % midPool.length];
  }
  if (entity.hasAlchemyFire) {
    const alchPool = ['girl_0', 'young_female_0', 'young_female_1', 'boy_0', 'young_man_1'] as const;
    return alchPool[h % alchPool.length];
  }
  const youthPool = [
    'boy_0',
    'boy_1',
    'girl_1',
    'girl_2',
    'young_man_0',
    'young_man_1',
    'young_man_2',
    'young_female_0',
    'young_female_2',
  ] as const;
  return youthPool[h % youthPool.length];
}

export function resolveStandeeUrl(entity: Parameters<typeof resolveStandeeId>[0]): string {
  return `assets/standees/${resolveStandeeId(entity)}.webp`;
}

export function resolveNpcIconUrl(entity: Parameters<typeof resolveStandeeId>[0]): string {
  return `assets/npc-icons/${resolveStandeeId(entity)}.webp`;
}

export function resolveAvatarFrameUrl(memberOrCand: {
  role?: Member['role'];
  spiritRoot?: { grade: string };
}): string {
  if (memberOrCand.role === 'sect_master') return 'assets/ui/heavenly_bronze_dragon_portrait.webp';
  if (memberOrCand.role === 'elder') return 'assets/ui/celestial_jade_bamboo_portrait.webp';
  if (memberOrCand.spiritRoot?.grade === '地品' || memberOrCand.spiritRoot?.grade === '天品') {
    return 'assets/ui/celestial_jade_portrait.webp';
  }
  return 'assets/ui/celestial_jade_white_portrait.webp';
}

export function resolveQualityRarity(quality: ItemQuality | string, tier?: string): RarityFrameKey {
  if (tier === '帝器') return 'phoenix';
  if (tier === '天阶') return 'dragon';
  if (tier === '地阶' || tier === '玄阶' || quality === '极品') return 'amethyst';
  if (quality === '上品') return 'jade';
  if (quality === '中品') return 'bronze';
  return 'wood';
}

export function resolveWeaponVisual(member: Member): {
  name: string;
  iconPath: string;
  rarity: RarityFrameKey;
} {
  if (member.equippedWeapon?.iconPath) {
    return {
      name: member.equippedWeapon.name,
      iconPath: member.equippedWeapon.iconPath,
      rarity: resolveQualityRarity(member.equippedWeapon.quality, member.equippedWeapon.tier),
    };
  }
  if (member.hasAlchemyFire) {
    return { name: '丹房控火尺', iconPath: 'assets/weapons/fan_t01_001.png', rarity: 'wood' };
  }
  const idx = stableHash(member.id) % FULL_WEAPON_CATALOG.length;
  const pick = FULL_WEAPON_CATALOG[idx];
  return { name: pick.label, iconPath: pick.iconPath, rarity: pick.rarity };
}

export function resolveMethodVisual(methodId: string): { iconPath: string; rarity: RarityFrameKey } {
  if (methodId === 'method_fenhuo_tiqing') return { iconPath: 'assets/icons/manuals-02.png', rarity: 'phoenix' };
  if (methodId === 'method_qinglian_huifeng') return { iconPath: 'assets/icons/skills-02.png', rarity: 'amethyst' };
  if (methodId === 'method_basic_sword') return { iconPath: 'assets/icons/skills-01.png', rarity: 'bronze' };
  return { iconPath: 'assets/icons/manuals-01.png', rarity: 'wood' };
}

export function resolveOpponentAvatar(opp: ArenaOpponent, index = 0): string {
  if (opp.portraitId) return resolvePortraitUrl(opp.portraitId);
  return `assets/cultivators/demonic_${String((index % 12) + 1).padStart(3, '0')}.png`;
}

export function resolveWildBeastsPreview(): Array<{
  id: string;
  name: string;
  realmLabel: string;
  circleUrl: string;
  hdUrl: string;
}> {
  return [
    {
      id: 'beast_001',
      name: '玄角妖狼',
      realmLabel: '炼气四层 · 山外妖兽',
      circleUrl: 'assets/beasts/beast_001.png',
      hdUrl: 'assets/beasts/hd/beast_001.webp',
    },
    {
      id: 'beast_002',
      name: '赤瞳石猿',
      realmLabel: '炼气三层 · 寒鸦岭',
      circleUrl: 'assets/beasts/beast_002.png',
      hdUrl: 'assets/beasts/hd/beast_002.webp',
    },
    {
      id: 'beast_003',
      name: '青鳞幽蟒',
      realmLabel: '炼气二层 · 药谷外林',
      circleUrl: 'assets/beasts/beast_003.png',
      hdUrl: 'assets/beasts/hd/beast_003.webp',
    },
  ];
}

export function resolveCandidateBadges(cand: Candidate): string[] {
  const badges: string[] = [];
  if (cand.auditioned) {
    if (cand.hasAlchemyFire) badges.push('通丹火');
    if (cand.hasSwordStance) badges.push('会剑架');
  }
  badges.push(`${cand.spiritRoot.grade}${cand.spiritRoot.elements.join('')}灵根`);
  return badges;
}

export interface GroupedWeaponStack {
  key: string;
  sample: HostEquipment;
  count: number;
}

export function groupWeaponsByKind(weapons: readonly HostEquipment[]): GroupedWeaponStack[] {
  const map = new Map<string, GroupedWeaponStack>();
  for (const wpn of weapons) {
    const key = `${wpn.templateId}|${wpn.name}|${wpn.tier}|${wpn.quality}|${wpn.refineLevel ?? 0}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (wpn.durability > existing.sample.durability) {
        existing.sample = wpn;
      }
    } else {
      map.set(key, { key, sample: wpn, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.sample.attackBonus - a.sample.attackBonus ||
      (b.sample.refineLevel ?? 0) - (a.sample.refineLevel ?? 0),
  );
}
