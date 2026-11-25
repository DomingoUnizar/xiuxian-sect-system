import type { RarityFrameKey } from '../ui/visuals/assetRegistry';
import rawActionReports from './action_reports_pool.json';
import rawCompendium from './compendium_lore.json';
import rawMissionsExt from './mission_templates_ext.json';
import rawReturnOpenings from './return_openings.json';

export type MissionFlavorCategory = 'alchemy' | 'combat' | 'herb' | 'heritage' | 'expedition';
export type CompendiumKind = 'weapon' | 'pill' | 'herb' | 'manual' | 'talisman' | 'beast';
export type CompendiumTier = '凡阶' | '玄阶' | '地阶' | '天阶' | '帝器';
export type ActionReportScene = 'alchemy_step' | 'arena_clash' | 'wild_encounter';
export type ActionReportTag =
  | 'warmup'
  | 'purify'
  | 'success'
  | 'fail'
  | 'clash'
  | 'dodge'
  | 'talisman_save'
  | 'rescue';
export type ReturnDurationTier = 'short' | 'medium' | 'long';
export type ReturnMood = 'calm' | 'alchemy_boom' | 'arena_fervor' | 'new_disciples';

export interface MissionTemplateExt {
  id: string;
  category: MissionFlavorCategory;
  title: string;
  systemToast: string;
  hostInnerAccept: string;
  hostInnerDecline: string;
  publicSummary: string;
}

export interface CompendiumLoreEntry {
  id: string;
  kind: CompendiumKind;
  subType: string;
  name: string;
  tier: CompendiumTier;
  lore: string;
}

export interface ActionReportEntry {
  id: string;
  scene: ActionReportScene;
  tag: ActionReportTag;
  shortReport: string;
}

export interface ReturnOpeningEntry {
  id: string;
  durationTier: ReturnDurationTier;
  mood: ReturnMood;
  opening: string;
}

export const MISSION_TEMPLATES_EXT = rawMissionsExt as MissionTemplateExt[];
export const COMPENDIUM_LORE = rawCompendium as CompendiumLoreEntry[];
export const ACTION_REPORTS_POOL = rawActionReports as ActionReportEntry[];
export const RETURN_OPENINGS = rawReturnOpenings as ReturnOpeningEntry[];

function hashStr(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WEAPON_ICON_MAP: Record<string, readonly [string, string, string]> = {
  sword: ['assets/weapons/sword_t01_001.png', 'assets/weapons/sword_t02_006.png', 'assets/weapons/ma_tu_sword_t03_011.png'],
  saber: ['assets/weapons/ma_tu_saber_t01_001.png', 'assets/weapons/ma_tu_saber_t02_006.png', 'assets/weapons/ma_tu_saber_t03_011.png'],
  polearm: ['assets/weapons/ma_tu_polearm_t01_001.png', 'assets/weapons/ma_tu_polearm_t02_006.png', 'assets/weapons/ma_tu_polearm_t04_011.png'],
  axe: ['assets/weapons/axe_t01_001.png', 'assets/weapons/axe_t02_006.png', 'assets/weapons/axe_t03_011.png'],
  bow: ['assets/weapons/bow_t01_001.png', 'assets/weapons/bow_t02_006.png', 'assets/weapons/bow_t03_011.png'],
  staff: ['assets/weapons/ma_tu_staff_t01_001.png', 'assets/weapons/ma_tu_staff_t02_006.png', 'assets/weapons/ma_tu_staff_t04_011.png'],
  fan: ['assets/weapons/fan_t01_001.png', 'assets/weapons/fan_t02_006.png', 'assets/weapons/fan_t03_011.png'],
  gauntlet: ['assets/weapons/gauntlet_t01_001.png', 'assets/weapons/gauntlet_t02_006.png', 'assets/weapons/gauntlet_t03_011.png'],
  bell: ['assets/weapons/bell_t01_001.png', 'assets/weapons/bell_t02_006.png', 'assets/weapons/bell_t03_011.png'],
  mirror: ['assets/weapons/ma_tu_mirror_t01_001.png', 'assets/weapons/ma_tu_mirror_t02_006.png', 'assets/weapons/ma_tu_mirror_t04_011.png'],
  seal: ['assets/weapons/ma_tu_seal_t01_001.png', 'assets/weapons/seal_t02_004.png', 'assets/weapons/ma_tu_seal_t04_011.png'],
  instrument: ['assets/weapons/instrument_t01_001.png', 'assets/weapons/instrument_t02_006.png', 'assets/weapons/instrument_t03_011.png'],
};

const TIER_RARITY_MAP: Record<CompendiumTier, RarityFrameKey> = {
  凡阶: 'wood',
  玄阶: 'bronze',
  地阶: 'jade',
  天阶: 'amethyst',
  帝器: 'dragon',
};

function resolveMissionFlavorCategory(targetType: string): MissionFlavorCategory {
  if (targetType === 'first_alchemy' || targetType === 'followup_alchemy_humai') return 'alchemy';
  if (
    targetType === 'first_arena_win' ||
    targetType === 'followup_arena_rematch' ||
    targetType === 'challenge_gate_duel' ||
    targetType === 'conquer_frontline' ||
    targetType.startsWith('tournament_')
  ) {
    return 'combat';
  }
  if (
    targetType === 'followup_heritage_fenhuo' ||
    targetType === 'craft_forging_sword' ||
    targetType === 'craft_forging_core' ||
    targetType === 'realm_breakthrough'
  ) {
    return 'heritage';
  }
  if (targetType === 'followup_wild_expedition') return 'expedition';
  return 'herb';
}

export function pickMissionFlavor(targetType: string, memberId: string, tick: number): MissionTemplateExt {
  const category = resolveMissionFlavorCategory(targetType);
  const filtered = MISSION_TEMPLATES_EXT.filter((t) => t.category === category);
  const pool = filtered.length > 0 ? filtered : MISSION_TEMPLATES_EXT;
  const idx = hashStr(`${targetType}:${memberId}:${Math.floor(tick / 12)}`) % pool.length;
  return pool[idx];
}

export function formatActionReport(
  scene: ActionReportScene,
  tag: ActionReportTag,
  vars: { actor: string; peer?: string; item?: string },
  salt: string,
): string {
  const exactPool = ACTION_REPORTS_POOL.filter((r) => r.scene === scene && r.tag === tag);
  const tagFallback = ACTION_REPORTS_POOL.filter((r) => r.tag === tag);
  const pool = exactPool.length > 0 ? exactPool : tagFallback.length > 0 ? tagFallback : ACTION_REPORTS_POOL;
  const picked = pool[hashStr(`${scene}:${tag}:${salt}`) % pool.length];
  return picked.shortReport
    .replaceAll('{actor}', vars.actor)
    .replaceAll('{peer}', vars.peer ?? '同门执事')
    .replaceAll('{item}', vars.item ?? '炉中药材');
}

export function pickReturnOpening(ticksSimulated: number, moodHint: ReturnMood, salt: string): string {
  const tier: ReturnDurationTier = ticksSimulated < 96 ? 'short' : ticksSimulated < 720 ? 'medium' : 'long';
  const matched = RETURN_OPENINGS.filter((r) => r.durationTier === tier && r.mood === moodHint);
  const tierFallback = RETURN_OPENINGS.filter((r) => r.durationTier === tier);
  const pool = matched.length > 0 ? matched : tierFallback.length > 0 ? tierFallback : RETURN_OPENINGS;
  return pool[hashStr(`${tier}:${moodHint}:${salt}`) % pool.length].opening;
}

export function resolveCompendiumVisual(entry: CompendiumLoreEntry): {
  iconPath: string;
  rarity: RarityFrameKey;
} {
  const rarity = TIER_RARITY_MAP[entry.tier] ?? 'wood';
  const h = hashStr(`${entry.id}:${entry.name}`);

  if (entry.kind === 'weapon') {
    const trio = WEAPON_ICON_MAP[entry.subType] ?? WEAPON_ICON_MAP.sword;
    const tierIdx = entry.tier === '凡阶' ? 0 : entry.tier === '玄阶' || entry.tier === '地阶' ? 1 : 2;
    return { iconPath: trio[tierIdx], rarity };
  }
  if (entry.kind === 'pill') {
    const icons = ['assets/icons/pills-01.png', 'assets/icons/pills-02.png', 'assets/icons/pills-03.png'] as const;
    return { iconPath: icons[h % icons.length], rarity };
  }
  if (entry.kind === 'herb') {
    const icons = ['assets/icons/botanical-01.png', 'assets/icons/botanical-02.png', 'assets/icons/botanical-03.png'] as const;
    return { iconPath: icons[h % icons.length], rarity };
  }
  if (entry.kind === 'manual') {
    const icons = ['assets/icons/manuals-01.png', 'assets/icons/manuals-02.png', 'assets/icons/manuals-03.png'] as const;
    return { iconPath: icons[h % icons.length], rarity };
  }
  if (entry.kind === 'talisman') {
    const icons = ['assets/icons/talismans-01.png', 'assets/icons/talismans-02.png', 'assets/icons/talismans-03.png'] as const;
    return { iconPath: icons[h % icons.length], rarity };
  }
  return {
    iconPath: `assets/beasts/beast_${String((h % 10) + 1).padStart(3, '0')}.png`,
    rarity,
  };
}
