export const SCHEMA_VERSION = 2;
export const RULES_VERSION = 'm2-rules-1.0.0';
export const CONTENT_VERSION = 'm2-content-1.0.0';
export const RNG_VERSION = 'pure-rand-xoroshiro128plus-v1';

/** 1 现实分钟 = 1 世界日；1 世界日 = 12 刻（十二时辰） */
export const TICKS_PER_DAY = 12;
export const DEFAULT_MS_PER_TICK = 5000;

/** 八小时离线补算标准刻度：480 分钟 = 480 世界日 = 5760 刻 */
export const EIGHT_HOURS_TICKS = 8 * 60 * TICKS_PER_DAY;

export const REALMS = [
  '凡人',
  '淬体',
  '炼气',
  '筑基',
  '紫府',
  '金丹',
  '元婴',
  '出窍',
  '化神',
  '炼虚',
  '合体',
  '大乘',
  '渡劫',
  '无漏',
] as const;

export type Realm = (typeof REALMS)[number];

export const SPIRIT_ROOT_ELEMENTS = ['金', '木', '水', '火', '土', '雷', '风', '冰'] as const;
export type SpiritRootElement = (typeof SPIRIT_ROOT_ELEMENTS)[number];

export const SPIRIT_ROOT_GRADES = ['凡品', '地品', '天品'] as const;
export type SpiritRootGrade = (typeof SPIRIT_ROOT_GRADES)[number];

export const ARTIFACT_TIERS = ['凡阶', '玄阶', '地阶', '天阶', '帝器'] as const;
export type ArtifactTier = (typeof ARTIFACT_TIERS)[number];

export const ITEM_QUALITIES = ['下品', '中品', '上品', '极品'] as const;
export type ItemQuality = (typeof ITEM_QUALITIES)[number];

export const PERSONALITY_TRAITS = ['谨慎', '好战', '冷静', '重利', '重情', '野心', '专研'] as const;
export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

export const SYSTEM_PERMISSION_TIERS = [
  { key: 'initial', name: '初始绑定', foundationRequired: 0 },
  { key: 'standing_bounty', name: '自动悬赏', foundationRequired: 2 },
  { key: 'rule_grant', name: '规则赐予', foundationRequired: 5 },
  { key: 'multi_causal', name: '多人因果', foundationRequired: 9 },
  { key: 'sect_law', name: '宗门法则', foundationRequired: 14 },
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSION_TIERS)[number]['key'];

export const RULE_GRANT_ABILITIES = [
  {
    id: 'ability_keep_fire',
    name: '留一息火',
    category: 'alchemy',
    daoyuanCost: 10,
    description: '控火切换时留住旧火一息，炉温稳落合药区间，成丹品相提升一档。',
  },
  {
    id: 'ability_desperate_burst',
    name: '绝境爆发',
    category: 'combat',
    daoyuanCost: 12,
    description: '交锋首次跌至三成气血以下且未倒时，当场回涌半数气血并连出两记重击。',
  },
  {
    id: 'ability_beast_awakening',
    name: '灵犀血脉觉醒',
    category: 'beast',
    daoyuanCost: 10,
    description: '唤醒结契或随行灵兽血脉，寒泉探境额外多衔回一份潮纹玉与带露玉髓花，并减免山野暗伤。',
  },
] as const;

export type RuleAbilityId = (typeof RULE_GRANT_ABILITIES)[number]['id'];

/** 宗门公开视角绝对不允许泄露的系统关键词 */
export const SYSTEM_FORBIDDEN_PUBLIC_TERMS = [
  '系统',
  '【叮',
  '私令',
  '道源',
  '道统根基',
  '十轮修为灌注',
  '宿主',
] as const;

export const SPIRIT_STONE_EXCHANGE_RATIO = 10_000;
