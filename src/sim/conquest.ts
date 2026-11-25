import { appendFact, nextEntityId } from './facts';
import { checkAndUnlockPermissions } from './heritage';
import { computeMemberPowerScore, getArtifactMasteryFactor } from './power';
import type { ArenaOpponent, HostEquipment, Member, WorldState } from './types';

export interface ConquestStageSpec {
  stageIndex: number;
  id: string;
  badge: string;
  title: string;
  regionSubtitle: string;
  opponent: ArenaOpponent;
  foundationAward: number;
  daoyuanAward: number;
  reputationAward: number;
  spiritStones: { low?: number; mid?: number; high?: number; supreme?: number };
  pillId?: string;
  pillQty?: number;
  weaponDrop?: Omit<HostEquipment, 'id'>;
  rewardSummary: string;
  isRepeatable?: boolean;
}

export const CONQUEST_STAGES: ConquestStageSpec[] = [
  {
    stageIndex: 0,
    id: 'conquest_01_heifeng',
    badge: '第 1 重 · 炼气境',
    title: '荡平黑风散修盟',
    regionSubtitle: '山门外百里黑风寨近来截杀商旅、屡犯药圃，正宜派猛将前往清剿立威。',
    opponent: {
      id: 'boss_heifeng_01',
      name: '厉千山',
      title: '黑风寨主（炼气八层）',
      portraitId: 'demonic_001',
      realm: '炼气',
      realmLayer: 8,
      powerScore: 105,
      maxHp: 112,
      attack: 22,
      defense: 9,
      evasion: 46,
      knownMethod: '黑煞劈风刀',
      available: true,
    },
    foundationAward: 2,
    daoyuanAward: 22,
    reputationAward: 12,
    spiritStones: { low: 120 },
    pillId: 'pill_humai_2_mid',
    pillQty: 2,
    rewardSummary: '+2 根基 · +22 道源 · 下品灵石×120 · 二阶中品护脉丹×2',
  },
  {
    stageIndex: 1,
    id: 'conquest_02_lieyang',
    badge: '第 2 重 · 筑基境',
    title: '反杀烈阳剑派真传',
    regionSubtitle: '邻域烈阳剑派真传弟子登门踢馆索要灵脉供奉，以硬实力反抽其颜面！',
    opponent: {
      id: 'boss_lieyang_02',
      name: '炎无极',
      title: '烈阳剑派真传（筑基五层）',
      portraitId: 'demonic_003',
      realm: '筑基',
      realmLayer: 5,
      powerScore: 215,
      maxHp: 210,
      attack: 36,
      defense: 15,
      evasion: 48,
      knownMethod: '烈阳焚天剑',
      available: true,
    },
    foundationAward: 3,
    daoyuanAward: 35,
    reputationAward: 18,
    spiritStones: { low: 200, mid: 2 },
    pillId: 'pill_humai_2_high',
    pillQty: 2,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '烈阳赤霄剑',
      tier: '玄阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t02_006.png',
      durability: 70,
      maxDurability: 70,
      attackBonus: 54,
      defenseBonus: 18,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+3 根基 · +35 道源 · 玄阶上品「烈阳赤霄剑」· 中品灵石×2',
  },
  {
    stageIndex: 2,
    id: 'conquest_03_zifu',
    badge: '第 3 重 · 紫府秘境',
    title: '踏平古修紫府秘境',
    regionSubtitle: '百里外古修遗迹禁制松动，击败镇殿金傀即可独占紫府藏宝阁！',
    opponent: {
      id: 'boss_zifu_03',
      name: '紫府金傀',
      title: '古修遗府守殿傀儡（紫府四层）',
      portraitId: 'demonic_006',
      realm: '紫府',
      realmLayer: 4,
      powerScore: 360,
      maxHp: 330,
      attack: 54,
      defense: 24,
      evasion: 50,
      knownMethod: '千钧镇岳拳印',
      available: true,
    },
    foundationAward: 3,
    daoyuanAward: 50,
    reputationAward: 25,
    spiritStones: { mid: 5 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 2,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '紫府镇山印',
      tier: '地阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_seal_t04_011.png',
      durability: 95,
      maxDurability: 95,
      attackBonus: 118,
      defenseBonus: 42,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+3 根基 · +50 道源 · 地阶上品「紫府镇山印」· 中品灵石×5',
  },
  {
    stageIndex: 3,
    id: 'conquest_04_tianjian',
    badge: '第 4 重 · 金丹上宗',
    title: '横扫天剑阁巡界使',
    regionSubtitle: '上域大派天剑阁巡使欲强行收编我派灵矿，当众斩其剑意、震慑九域！',
    opponent: {
      id: 'boss_tianjian_04',
      name: '凌沧海',
      title: '天剑阁巡界使（金丹三层）',
      portraitId: 'demonic_009',
      realm: '金丹',
      realmLayer: 3,
      powerScore: 580,
      maxHp: 500,
      attack: 82,
      defense: 36,
      evasion: 52,
      knownMethod: '星河巡界一剑',
      available: true,
    },
    foundationAward: 4,
    daoyuanAward: 75,
    reputationAward: 35,
    spiritStones: { high: 3 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 3,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '太虚星河剑',
      tier: '天阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
      durability: 120,
      maxDurability: 120,
      attackBonus: 240,
      defenseBonus: 88,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+4 根基 · +75 道源 · 天阶上品「太虚星河剑」· 上品灵石×3',
  },
  {
    stageIndex: 4,
    id: 'conquest_05_xuemo',
    badge: '第 5 重 · 元婴大劫',
    title: '镇压血魔老祖灭门大劫',
    regionSubtitle: '幽冥血海元婴魔祖亲率魔潮压境！击碎魔躯便能举派登顶九域无上仙宗！',
    opponent: {
      id: 'boss_xuemo_05',
      name: '幽泉魔祖',
      title: '血海元婴老祖（元婴二层）',
      portraitId: 'demonic_012',
      realm: '元婴',
      realmLayer: 2,
      powerScore: 880,
      maxHp: 760,
      attack: 120,
      defense: 50,
      evasion: 54,
      knownMethod: '幽冥血煞神通',
      available: true,
    },
    foundationAward: 5,
    daoyuanAward: 120,
    reputationAward: 60,
    spiritStones: { high: 5, supreme: 1 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 4,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '万古镇世钟',
      tier: '天阶',
      quality: '极品',
      iconPath: 'assets/weapons/bell_t03_011.png',
      durability: 160,
      maxDurability: 160,
      attackBonus: 310,
      defenseBonus: 118,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+5 根基 · +120 道源 · 天阶极品「万古镇世钟」· 极品灵石×1',
  },
  {
    stageIndex: 5,
    id: 'conquest_06_lianxu',
    badge: '第 6 重 · 炼虚古殿',
    title: '踏灭幽冥炼虚殿',
    regionSubtitle: '古传送阵彼端幽冥古殿觊觎我宗灵脉，踏破殿门斩殿主、夺太初开天帝剑！',
    opponent: {
      id: 'boss_lianxu_06',
      name: '墨渊殿主',
      title: '幽冥古殿主人（炼虚四层）',
      portraitId: 'demonic_007',
      realm: '炼虚',
      realmLayer: 4,
      powerScore: 1850,
      maxHp: 1480,
      attack: 230,
      defense: 95,
      evasion: 55,
      knownMethod: '幽冥撕界指',
      available: true,
    },
    foundationAward: 4,
    daoyuanAward: 160,
    reputationAward: 85,
    spiritStones: { high: 8, supreme: 1 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 5,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '太初开天剑',
      tier: '帝器',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
      durability: 220,
      maxDurability: 220,
      attackBonus: 460,
      defenseBonus: 180,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+4 根基 · +160 道源 · 帝器上品「太初开天剑」· 极品灵石×1',
  },
  {
    stageIndex: 6,
    id: 'conquest_07_dacheng',
    badge: '第 7 重 · 大乘妖庭',
    title: '斩杀万妖大乘圣皇',
    regionSubtitle: '十万妖山圣皇聚妖兵压境！正面击碎其妖帝法相，截获混沌镇世宝塔！',
    opponent: {
      id: 'boss_dacheng_07',
      name: '焚天妖皇',
      title: '万妖山脉圣皇（大乘三层）',
      portraitId: 'demonic_010',
      realm: '大乘',
      realmLayer: 3,
      powerScore: 3400,
      maxHp: 2600,
      attack: 390,
      defense: 160,
      evasion: 56,
      knownMethod: '焚天妖帝灭世焰',
      available: true,
    },
    foundationAward: 5,
    daoyuanAward: 240,
    reputationAward: 130,
    spiritStones: { high: 12, supreme: 2 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 6,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '混沌镇世塔',
      tier: '帝器',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_mirror_t04_011.png',
      durability: 280,
      maxDurability: 280,
      attackBonus: 740,
      defenseBonus: 290,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+5 根基 · +240 道源 · 帝器极品「混沌镇世塔」· 极品灵石×2',
  },
  {
    stageIndex: 7,
    id: 'conquest_08_dujie',
    badge: '第 8 重 · 九天渡劫',
    title: '独战九霄巡天仙使',
    regionSubtitle: '登临修真界绝巅之战！力压渡劫巡天仙使，夺无漏帝印、立万古无上仙门！',
    opponent: {
      id: 'boss_dujie_08',
      name: '玄昊仙使',
      title: '九霄巡天大能（渡劫五层）',
      portraitId: 'righteous_048',
      realm: '渡劫',
      realmLayer: 5,
      powerScore: 5600,
      maxHp: 4200,
      attack: 580,
      defense: 240,
      evasion: 57,
      knownMethod: '九霄天罚仙剑阵',
      available: true,
    },
    foundationAward: 6,
    daoyuanAward: 400,
    reputationAward: 200,
    spiritStones: { high: 20, supreme: 5 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 10,
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '鸿蒙无漏印',
      tier: '帝器',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_seal_t04_011.png',
      durability: 360,
      maxDurability: 360,
      attackBonus: 1120,
      defenseBonus: 440,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+6 根基 · +400 道源 · 帝器极品「鸿蒙无漏印」· 极品灵石×5',
  },
];

export const REPEATABLE_REALM_STAGE: ConquestStageSpec = {
  stageIndex: 8,
  id: 'conquest_repeatable_raid',
  badge: '诸天秘境 · 无尽刷宝',
  title: '诸天太古秘境巡猎',
  regionSubtitle: '既已威震九天十地，可遣门人反复巡猎太古秘境，爆刷海量道源、极品灵石与帝丹宝材！',
  opponent: {
    id: 'boss_secret_raid',
    name: '太古雷劫神兽',
    title: '古秘境雷池镇守兽（渡劫大能）',
    portraitId: 'beast_001',
    realm: '渡劫',
    realmLayer: 2,
    powerScore: 5200,
    maxHp: 3800,
    attack: 520,
    defense: 210,
    evasion: 56,
    knownMethod: '九霄狂雷扑杀',
    available: true,
  },
  foundationAward: 2,
  daoyuanAward: 120,
  reputationAward: 45,
  spiritStones: { high: 6, supreme: 1 },
  pillId: 'pill_humai_2_supreme',
  pillQty: 4,
  rewardSummary: '+120 道源 · 上品灵石×6 · 极品灵石×1 · 极品护脉丹×4',
  isRepeatable: true,
};

export function getCurrentConquestStage(conquestProgress = 0): ConquestStageSpec {
  if (conquestProgress >= CONQUEST_STAGES.length) {
    return REPEATABLE_REALM_STAGE;
  }
  return CONQUEST_STAGES[Math.max(0, conquestProgress)] ?? CONQUEST_STAGES[0];
}

export function getStrongestActiveMember(state: Pick<WorldState, 'members'>): Member | null {
  const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
  if (actives.length === 0) return null;
  return [...actives].sort((a, b) => computeMemberPowerScore(b) - computeMemberPowerScore(a))[0];
}

export function settleConquestVictory(
  state: WorldState,
  victor: Member,
  battleFactId: string,
  missionId?: string,
): { factIds: string[]; systemLootText: string } {
  const progress = state.conquestStage ?? 0;
  const stage = getCurrentConquestStage(progress);
  const isFirstClear = progress < CONQUEST_STAGES.length;

  state.conquestStage = isFirstClear ? progress + 1 : progress;
  state.daoyuanAvailable += stage.daoyuanAward;
  state.foundationPoints += stage.foundationAward;
  state.sectReputation += stage.reputationAward;

  state.inventory.spiritStones.low += stage.spiritStones.low ?? 0;
  state.inventory.spiritStones.mid += stage.spiritStones.mid ?? 0;
  state.inventory.spiritStones.high += stage.spiritStones.high ?? 0;
  state.inventory.spiritStones.supreme += stage.spiritStones.supreme ?? 0;

  if (stage.pillId && stage.pillQty) {
    state.inventory.pills[stage.pillId] = (state.inventory.pills[stage.pillId] ?? 0) + stage.pillQty;
  }

  let weaponEquipText = '';
  let lootPublicParts: string[] = [];
  if (stage.spiritStones.supreme) lootPublicParts.push(`极品灵石×${stage.spiritStones.supreme}`);
  if (stage.spiritStones.high) lootPublicParts.push(`上品灵石×${stage.spiritStones.high}`);
  if (stage.spiritStones.mid) lootPublicParts.push(`中品灵石×${stage.spiritStones.mid}`);
  if (stage.spiritStones.low) lootPublicParts.push(`下品灵石×${stage.spiritStones.low}`);

  if (stage.weaponDrop && isFirstClear) {
    const droppedWeapon: HostEquipment = {
      ...stage.weaponDrop,
      id: nextEntityId(state, 'wpn'),
    };
    const canWield = getArtifactMasteryFactor(victor.realm, droppedWeapon.tier) > 0;
    const isUpgrade = droppedWeapon.attackBonus > (victor.equippedWeapon?.attackBonus ?? 0);
    if (canWield && isUpgrade) {
      if (victor.equippedWeapon) {
        state.inventory.weapons.push(victor.equippedWeapon);
      }
      victor.equippedWeapon = droppedWeapon;
      weaponEquipText = `${droppedWeapon.tier}${droppedWeapon.quality}「${droppedWeapon.name}」(当场认主佩戴)`;
    } else {
      state.inventory.weapons.push(droppedWeapon);
      weaponEquipText = `${droppedWeapon.tier}${droppedWeapon.quality}「${droppedWeapon.name}」(已入宝库)`;
    }
    lootPublicParts.push(weaponEquipText);
  }

  const ledgerBase = `conquest:${stage.id}:${state.tick}:${victor.id}`;
  state.ledger.push(
    {
      id: `${ledgerBase}:daoyuan`,
      settlementId: missionId ?? stage.id,
      effectIndex: 0,
      tick: state.tick,
      recipientId: 'system',
      kind: 'daoyuan_gain',
      delta: stage.daoyuanAward,
      summary: `征伐大捷「${stage.title}」爆赏 +${stage.daoyuanAward} 道源`,
    },
    {
      id: `${ledgerBase}:foundation`,
      settlementId: missionId ?? stage.id,
      effectIndex: 1,
      tick: state.tick,
      recipientId: 'system',
      kind: 'foundation_gain',
      delta: stage.foundationAward,
      summary: `征伐大捷「${stage.title}」增厚 +${stage.foundationAward} 点道统根基`,
    },
  );

  const systemLootText = `战利品：+${stage.foundationAward} 根基、+${stage.daoyuanAward} 道源${
    weaponEquipText ? `、${weaponEquipText}` : ''
  }`;

  const fact = appendFact(state, {
    type: 'battle.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [victor.id],
    missionId,
    causeIds: [battleFactId],
    battleFactId,
    publicSummary: `【山门大捷】${victor.name} 领衔出征，正面击溃 ${stage.opponent.name} 并${stage.title}，缴获${lootPublicParts.join('、') || '海量灵石宝药'}，${state.sectName}威名远播修真界！`,
    privateSummary: null,
    systemSummary: `【叮！征伐大捷】${victor.name} ${stage.title}成功！${systemLootText}，宗门声望 +${stage.reputationAward}。`,
    cueTier: 'major',
  });

  const unlockedFacts = checkAndUnlockPermissions(state, fact.id);
  return {
    factIds: [fact.id, ...unlockedFacts],
    systemLootText,
  };
}
