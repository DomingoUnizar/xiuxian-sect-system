import { REALMS, TICKS_PER_DAY } from './constants';
import { applyCultivationDelta } from './cultivation';
import { appendDramaScene, appendFact, nextEntityId } from './facts';
import { checkAndUnlockPermissions } from './heritage';
import { computeMemberPowerScore } from './power';
import type {
  ArenaOpponent,
  BattleFact,
  BattleTurn,
  ClutchChoiceKey,
  HostEquipment,
  Member,
  PendingClutchCrisis,
  SectCrisisState,
  WorldState,
} from './types';

export interface SectCrisisSpec {
  chapterIndex: number;
  badge: string;
  title: string;
  hookLine: string;
  durationTicks: number;
  opponent: ArenaOpponent;
  foundationAward: number;
  daoyuanAward: number;
  reputationAward: number;
  spiritStones: { low?: number; mid?: number; high?: number; supreme?: number };
  pillId?: string;
  pillQty?: number;
  weaponDrop?: Omit<HostEquipment, 'id'>;
  rewardSummary: string;
}

export const SECT_CRISIS_CHAPTERS: SectCrisisSpec[] = [
  {
    chapterIndex: 0,
    badge: '第 1 幕 · 护匾生死局',
    title: '三十日护匾之战 · 烈阳少主压境',
    hookLine: '烈阳剑派少宗主「炎破军」放话三十日后踏山拆匾，夺走后山灵脉！',
    durationTicks: 30 * TICKS_PER_DAY,
    opponent: {
      id: 'crisis_boss_1',
      name: '炎破军',
      title: '烈阳剑派少宗主（筑基三层）',
      portraitId: 'demonic_003',
      realm: '筑基',
      realmLayer: 3,
      powerScore: 265,
      maxHp: 220,
      attack: 38,
      defense: 15,
      evasion: 48,
      knownMethod: '焚脉霸剑',
      available: true,
    },
    foundationAward: 3,
    daoyuanAward: 35,
    reputationAward: 20,
    spiritStones: { low: 180 },
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '破军赤霄剑',
      tier: '玄阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t02_006.png',
      durability: 80,
      maxDurability: 80,
      attackBonus: 56,
      defenseBonus: 20,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+3 根基 · +35 道源 · 下品灵石×180 · 玄阶上品「破军赤霄剑」',
  },
  {
    chapterIndex: 1,
    badge: '第 2 幕 · 丹席争锋',
    title: '三十五日丹盟夺席 · 药王执事问难',
    hookLine: '药王谷执事「韩枯荣」借试药之名欲封禁我派药圃商路，须正面挫其锐气！',
    durationTicks: 35 * TICKS_PER_DAY,
    opponent: {
      id: 'crisis_boss_2',
      name: '韩枯荣',
      title: '药王谷红袍执事（筑基八层）',
      portraitId: 'demonic_005',
      realm: '筑基',
      realmLayer: 8,
      powerScore: 345,
      maxHp: 290,
      attack: 48,
      defense: 20,
      evasion: 49,
      knownMethod: '枯木蚀心掌',
      available: true,
    },
    foundationAward: 3,
    daoyuanAward: 45,
    reputationAward: 26,
    spiritStones: { mid: 2 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 3,
    rewardSummary: '+3 根基 · +45 道源 · 中品灵石×2 · 二阶极品护脉丹×3',
  },
  {
    chapterIndex: 2,
    badge: '第 3 幕 · 血煞夜袭',
    title: '四十日紫府破阵夜 · 黑水老魔叩关',
    hookLine: '寒鸦魔渊尊者「黑水老魔」趁月黑风高率煞傀逼近山阵，誓要血洗灵泉！',
    durationTicks: 40 * TICKS_PER_DAY,
    opponent: {
      id: 'crisis_boss_3',
      name: '黑水老魔',
      title: '寒鸦魔渊尊者（紫府四层）',
      portraitId: 'demonic_006',
      realm: '紫府',
      realmLayer: 4,
      powerScore: 480,
      maxHp: 400,
      attack: 66,
      defense: 28,
      evasion: 51,
      knownMethod: '玄阴裂魂爪',
      available: true,
    },
    foundationAward: 4,
    daoyuanAward: 65,
    reputationAward: 36,
    spiritStones: { mid: 5 },
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '镇岳玄钟',
      tier: '地阶',
      quality: '上品',
      iconPath: 'assets/weapons/bell_t03_011.png',
      durability: 110,
      maxDurability: 110,
      attackBonus: 120,
      defenseBonus: 46,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+4 根基 · +65 道源 · 中品灵石×5 · 地阶上品「镇岳玄钟」',
  },
  {
    chapterIndex: 3,
    badge: '第 4 幕 · 天剑问鼎',
    title: '四十五日东域大试 · 天剑首席试锋',
    hookLine: '上域天剑阁巡使「凌沧海」亲临压境，赢下他方能让诸域承认本门立宗之名！',
    durationTicks: 45 * TICKS_PER_DAY,
    opponent: {
      id: 'crisis_boss_4',
      name: '凌沧海',
      title: '天剑阁真传首座（金丹三层）',
      portraitId: 'demonic_009',
      realm: '金丹',
      realmLayer: 3,
      powerScore: 700,
      maxHp: 580,
      attack: 94,
      defense: 40,
      evasion: 53,
      knownMethod: '星河断界剑',
      available: true,
    },
    foundationAward: 4,
    daoyuanAward: 90,
    reputationAward: 50,
    spiritStones: { high: 3 },
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '太虚星河剑',
      tier: '天阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
      durability: 140,
      maxDurability: 140,
      attackBonus: 245,
      defenseBonus: 92,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+4 根基 · +90 道源 · 上品灵石×3 · 天阶上品「太虚星河剑」',
  },
  {
    chapterIndex: 4,
    badge: '第 5 幕 · 灭门大劫',
    title: '五十日元婴魔潮 · 幽泉老祖亲临',
    hookLine: '幽冥血海「幽泉魔祖」携滔天魔威降临，守住这一关便立于九域圣地之林！',
    durationTicks: 50 * TICKS_PER_DAY,
    opponent: {
      id: 'crisis_boss_5',
      name: '幽泉魔祖',
      title: '血海元婴老祖（元婴二层）',
      portraitId: 'demonic_012',
      realm: '元婴',
      realmLayer: 2,
      powerScore: 1020,
      maxHp: 840,
      attack: 132,
      defense: 56,
      evasion: 54,
      knownMethod: '血海吞天印',
      available: true,
    },
    foundationAward: 6,
    daoyuanAward: 150,
    reputationAward: 80,
    spiritStones: { high: 5, supreme: 1 },
    weaponDrop: {
      templateId: 'weapon_chaowen_sword',
      name: '万古镇世剑',
      tier: '帝器',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
      durability: 200,
      maxDurability: 200,
      attackBonus: 520,
      defenseBonus: 190,
      specialTrait: 'water_tide',
    },
    rewardSummary: '+6 根基 · +150 道源 · 极品灵石×1 · 帝器极品「万古镇世剑」',
  },
];

export function createInitialSectCrisis(): SectCrisisState {
  const first = SECT_CRISIS_CHAPTERS[0];
  return {
    chapterIndex: 0,
    startedAtTick: 0,
    deadlineTick: first.durationTicks,
    defeatCount: 0,
    revengeBuffUntilTick: 0,
  };
}

export function getCurrentCrisisSpec(chapterIndex: number): SectCrisisSpec {
  if (chapterIndex < SECT_CRISIS_CHAPTERS.length) {
    return SECT_CRISIS_CHAPTERS[chapterIndex];
  }
  const extra = chapterIndex - SECT_CRISIS_CHAPTERS.length;
  const realmIdx = Math.min(REALMS.length - 1, 7 + extra);
  const realm = REALMS[realmIdx];
  const powerScore = 1350 + extra * 320;
  return {
    chapterIndex,
    badge: `仙宗巡天 · 第 ${extra + 1} 巡`,
    title: `域外天骄叩关 · 迎战「${realm}魔傀」`,
    hookLine: '万域仙盟轮番试剑，斩落天骄傀儡即可镇压四方气运！',
    durationTicks: 60 * TICKS_PER_DAY,
    opponent: {
      id: `crisis_boss_巡天_${extra + 1}`,
      name: `${realm}天骄傀`,
      title: `九域圣地试炼主（${realm}五层）`,
      portraitId: 'demonic_007',
      realm,
      realmLayer: 5,
      powerScore,
      maxHp: 1100 + extra * 260,
      attack: 165 + extra * 35,
      defense: 72 + extra * 16,
      evasion: 55,
      knownMethod: '混元天罡印',
      available: true,
    },
    foundationAward: 2,
    daoyuanAward: 80,
    reputationAward: 45,
    spiritStones: { high: 3, supreme: extra >= 2 ? 1 : 0 },
    pillId: 'pill_humai_2_supreme',
    pillQty: 3,
    rewardSummary: `+2 根基 · +80 道源 · 上品灵石×3${extra >= 2 ? ' · 极品灵石×1' : ''}`,
  };
}

export function getChampionEffectivePower(member: Member): {
  basePower: number;
  tacticalBonus: number;
  totalPower: number;
} {
  const basePower = computeMemberPowerScore(member);
  const tacticalBonus =
    (member.equippedWeapon?.specialTrait === 'water_tide' ? 12 : 0) +
    ((member.bonds?.length ?? 0) > 0 ? 8 : 0);
  return {
    basePower,
    tacticalBonus,
    totalPower: basePower + tacticalBonus,
  };
}

export function pickStrongestChampion(state: WorldState, preferredId?: string): Member | null {
  const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
  if (actives.length === 0) return null;
  if (preferredId) {
    const picked = actives.find((m) => m.id === preferredId);
    if (picked) return picked;
  }
  return [...actives].sort((a, b) => getChampionEffectivePower(b).totalPower - getChampionEffectivePower(a).totalPower)[0];
}

export function applyCrisisVictory(
  state: WorldState,
  spec: SectCrisisSpec,
  champion: Member,
  modeTag: 'direct' | 'future_strike' | 'immortal_aegis' | 'burn_lifespan' | 'deadline_win',
  customTurns?: BattleTurn[],
): { factId: string; dramaId: string; dropsText: string } {
  const crisis = (state.sectCrisis ??= createInitialSectCrisis());
  const beforePower = computeMemberPowerScore(champion);

  state.foundationPoints += spec.foundationAward;
  state.daoyuanAvailable += spec.daoyuanAward;
  state.sectReputation += spec.reputationAward;
  if (spec.spiritStones.low) state.inventory.spiritStones.low += spec.spiritStones.low;
  if (spec.spiritStones.mid) state.inventory.spiritStones.mid += spec.spiritStones.mid;
  if (spec.spiritStones.high) state.inventory.spiritStones.high += spec.spiritStones.high;
  if (spec.spiritStones.supreme) state.inventory.spiritStones.supreme += spec.spiritStones.supreme;
  if (spec.pillId && spec.pillQty) {
    state.inventory.pills[spec.pillId] = (state.inventory.pills[spec.pillId] ?? 0) + spec.pillQty;
  }

  const lootParts: string[] = [];
  if (spec.weaponDrop) {
    const newWeapon: HostEquipment = {
      id: nextEntityId(state, 'wpn'),
      ...spec.weaponDrop,
    };
    const oldWeapon = champion.equippedWeapon;
    if (!oldWeapon || oldWeapon.attackBonus < newWeapon.attackBonus) {
      if (oldWeapon) state.inventory.weapons.push(oldWeapon);
      champion.equippedWeapon = newWeapon;
    } else {
      state.inventory.weapons.push(newWeapon);
    }
    lootParts.push(`${newWeapon.tier}${newWeapon.quality}「${newWeapon.name}」`);
  }
  if (spec.spiritStones.low) lootParts.push(`下品灵石×${spec.spiritStones.low}`);
  if (spec.spiritStones.mid) lootParts.push(`中品灵石×${spec.spiritStones.mid}`);
  if (spec.spiritStones.high) lootParts.push(`上品灵石×${spec.spiritStones.high}`);
  if (spec.spiritStones.supreme) lootParts.push(`极品灵石×${spec.spiritStones.supreme}`);

  champion.foundation += 3;
  champion.hasWonFirstArena = true;
  if (modeTag === 'future_strike' || modeTag === 'immortal_aegis' || modeTag === 'burn_lifespan') {
    champion.clutchWins = (champion.clutchWins ?? 0) + 1;
    applyCultivationDelta(champion, 90);
    champion.notes.push(`山门护匾生死战绝境反杀「${spec.opponent.name}」`);
  } else {
    champion.hp = Math.max(Math.floor(champion.maxHp * 0.6), champion.hp - 12);
    applyCultivationDelta(champion, 45);
    champion.notes.push(`护山正面击溃「${spec.opponent.name}」`);
  }
  const newlyUnlocked = checkAndUnlockPermissions(state);
  const afterPower = computeMemberPowerScore(champion);

  const turns: BattleTurn[] = customTurns ?? [
    {
      turn: 1,
      actorName: spec.opponent.name,
      action: spec.opponent.knownMethod,
      detail: `${spec.opponent.name} 挟大派余威当先压上，欲一招震碎护山牌匾。`,
      damage: 24,
      targetRemainingHp: Math.max(18, champion.hp),
    },
    {
      turn: 2,
      actorName: champion.name,
      action: champion.equippedWeapon?.name ?? '护山剑诀',
      detail: `${champion.name} 沉肩卸劲，借平日暗中磨出的剑路与同门羁绊合势，反手夺回先机。`,
      damage: Math.round(spec.opponent.maxHp * 0.52),
      targetRemainingHp: Math.round(spec.opponent.maxHp * 0.48),
    },
    {
      turn: 3,
      actorName: champion.name,
      action: '一剑定匾',
      detail: `剑光劈落敌方护体罡风，${spec.opponent.name} 连退七步，失色抱拳离山！`,
      damage: Math.round(spec.opponent.maxHp * 0.48),
      targetRemainingHp: 0,
    },
  ];

  const battleId = nextEntityId(state, 'battle');
  const dropsText = lootParts.join('、') || spec.rewardSummary;
  const battleFact: BattleFact = {
    id: battleId,
    tick: state.tick,
    mode: 'arena_duel',
    actorIds: [champion.id],
    contextAtStart: {
      hostPower: beforePower,
      opponentPower: spec.opponent.powerScore,
      hostHp: champion.maxHp,
      opponentHp: spec.opponent.maxHp,
      weaponUsed: champion.equippedWeapon?.name,
      environment: `${state.sectName}护山大阵前`,
    },
    seedRef: `crisis:${spec.chapterIndex}`,
    ruleVersion: 'crisis-1.0',
    causes: [`${champion.name} 出战守卫山门，正面对决 ${spec.opponent.name}`],
    turns,
    outcome: modeTag === 'direct' || modeTag === 'deadline_win' ? 'win' : 'close_win',
    deltas: {
      hostHpDelta: -12,
      durabilityDelta: 0,
      talismanConsumed: 0,
    },
    afterEffectIds: [],
    shortReport: `${champion.name} 守住「${spec.badge}」，当众击退 ${spec.opponent.name}，缴获 ${dropsText}。`,
    detailedReport: turns.map((t) => `第${t.turn}合：${t.detail}`).join('\n'),
  };
  state.battleFacts[battleId] = battleFact;

  const publicOutcome =
    modeTag === 'future_strike'
      ? `${champion.name} 险死还生之际忽得惊天一剑破局，当众斩碎 ${spec.opponent.name} 的攻势，全山震动！`
      : modeTag === 'immortal_aegis'
        ? `${champion.name} 危急关头周身金光大放九息不灭，硬顶重击反震退 ${spec.opponent.name}，护下山门牌匾！`
        : modeTag === 'burn_lifespan'
          ? `${champion.name} 咬牙燃动十五载本命寿元强出绝命一剑，硬生生将 ${spec.opponent.name} 劈下山门！`
          : `${champion.name} 率众迎战「${spec.opponent.name}」，正面将其击退并缴获 ${dropsText}，护全山门清誉！`;

  const fact = appendFact(state, {
    type: 'battle.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [champion.id],
    battleFactId: battleId,
    publicSummary: `${publicOutcome} 战力跃升至 ${afterPower}。`,
    privateSummary: null,
    systemSummary: `【叮！护山危局大捷】${champion.name} 击破「${spec.badge}」强敌 ${spec.opponent.name}！获 +${spec.foundationAward} 根基、+${spec.daoyuanAward} 道源${
      newlyUnlocked.length > 0 ? '，顺势解锁新一层系统权限！' : '，即刻转入下一幕危机！'
    }`,
    details: battleFact.detailedReport,
    cueTier: 'major',
  });

  const delusionByMode: Record<typeof modeTag, string> = {
    direct: `${champion.name} 暗叹：「前辈这几日替我铺的路，原来全算准了今日这一剑！」`,
    future_strike: `${champion.name} 望着手中发颤的剑，冷汗浸透道袍：「方才那一式未来剑意，神秘老祖竟愿耗费无上伟力替我借光阴！」`,
    immortal_aegis: `${champion.name} 感受识海余温，满眼敬畏：「有那位暗中护道，纵使身陷绝境我亦敢孤身挡万敌！」`,
    burn_lifespan: `${champion.name} 擦去嘴角血迹却挺直脊梁：「纵损十五载寿元又何妨！前辈看在眼里，我绝不丢山门半分脸面！」`,
    deadline_win: `${champion.name} 收剑回望山门：「幸好早几日接了那道暗中指点，否则今日牌匾险矣。」`,
  };

  const drama = appendDramaScene(state, {
    title: `${spec.badge} · 护山大捷`,
    badge: modeTag === 'direct' || modeTag === 'deadline_win' ? '护山大捷' : '绝境翻盘',
    tone: modeTag === 'direct' || modeTag === 'deadline_win' ? 'crisis' : 'clutch',
    actorId: champion.id,
    actorName: champion.name,
    portraitId: champion.portraitId,
    beats: turns.map((t) => `第${t.turn}合 · ${t.action}：${t.detail}`),
    systemTruth:
      modeTag === 'burn_lifespan'
        ? `你按兵不动省下家底道源，放手让 ${champion.name} 自己燃寿死磕赢下山门，另赚 +${spec.daoyuanAward} 道源与 +${spec.foundationAward} 根基！`
        : modeTag === 'future_strike' || modeTag === 'immortal_aegis'
          ? `你在绝境读秒时刻拍下神权保驾，${champion.name} 一战封神并反赚 +${spec.daoyuanAward} 道源与战利品！`
          : `经你连日暗中拱火与赏赐，${champion.name} 战力达 ${beforePower}，踩线正面碾碎来犯强敌！`,
    hostDelusion: delusionByMode[modeTag],
    publicShock: `山下观战客商齐齐失声：「这小门派竟能击退${spec.opponent.title}？看来底蕴深不可测！」`,
  });

  const nextIdx = crisis.chapterIndex + 1;
  const nextSpec = getCurrentCrisisSpec(nextIdx);
  crisis.chapterIndex = nextIdx;
  crisis.startedAtTick = state.tick;
  crisis.deadlineTick = state.tick + nextSpec.durationTicks;
  crisis.revengeBuffUntilTick = 0;
  crisis.outpostCleared = false;

  return { factId: fact.id, dramaId: drama.id, dropsText };
}

export function applyCrisisDefeat(
  state: WorldState,
  spec: SectCrisisSpec,
  champion: Member,
  fromWatchColdly = false,
): { factId: string; dramaId: string } {
  const crisis = (state.sectCrisis ??= createInitialSectCrisis());
  const stolenStones = Math.min(state.inventory.spiritStones.low, Math.max(10, Math.round(state.inventory.spiritStones.low * 0.2)));
  state.inventory.spiritStones.low -= stolenStones;
  state.sectReputation = Math.max(0, state.sectReputation - 6);
  state.daoyuanAvailable += 10;
  champion.hp = Math.max(10, Math.floor(champion.maxHp * 0.35));
  if (!champion.injuries.includes('护山败退旧创')) {
    champion.injuries.push('护山败退旧创');
  }
  champion.notes.push(`山门遭「${spec.opponent.name}」掠走下品灵石 ${stolenStones} 枚，越挫越勇苦修追赶`);

  crisis.defeatCount += 1;
  crisis.revengeBuffUntilTick = state.tick + 12 * TICKS_PER_DAY;
  crisis.startedAtTick = state.tick;
  crisis.deadlineTick = state.tick + 15 * TICKS_PER_DAY;

  const fact = appendFact(state, {
    type: 'battle.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [champion.id],
    publicSummary: `${spec.opponent.name} 强压山门，${champion.name} 力战撤回，门内仅损下品灵石 ${stolenStones} 枚！全宗越挫越勇，十二日内吐纳灵效暴涨四成！`,
    privateSummary: null,
    systemSummary: `【护山危局暂挫·安慰奖】${champion.name} 暂退，仅损灵石 ${stolenStones} 枚；已发应急补贴 +10 道源，触发「越挫越勇」（12 日吐纳 +40%），15 日后再战！`,
    cueTier: 'major',
  });

  const drama = appendDramaScene(state, {
    title: `${spec.badge} · 越挫越勇`,
    badge: '越挫越勇',
    tone: 'clutch',
    actorId: champion.id,
    actorName: champion.name,
    portraitId: champion.portraitId,
    beats: [
      `${spec.opponent.name} 连破两重山门护阵，逼得 ${champion.name} 虎口震裂！`,
      `对方掠走 ${stolenStones} 枚下品灵石离去，山门上下反而憋足一口气疯狂加练！`,
    ],
    systemTruth: fromWatchColdly
      ? `你按兵不动保住底牌，并趁机往宿主识海多塞了 +10 点安慰道源，全宗触发【越挫越勇 +40%】翻倍发育！`
      : `虽暂退一筹，但损失极小且立即拿到 +10 道源补贴与【越挫越勇 +40%】修炼加速，很快就能反杀！`,
    hostDelusion: `${champion.name} 捏紧拳头暗喜：「前辈暗中渡来暖流抚平伤势，这是嫌我刚才打得不够爽，叫我养肥十日再虐回去！」`,
    publicShock: `全宗弟子非但没气馁，反而在演武台挑灯加练，气势一天比一天盛！`,
  });

  return { factId: fact.id, dramaId: drama.id };
}

export function resolveCrisisNow(
  state: WorldState,
  _commandId: string,
  challengerMemberId?: string,
): { ok: boolean; message: string; factIds: string[] } {
  if (state.pendingClutch) {
    return {
      ok: false,
      message: '眼前正值生死危机读秒时刻，请先在弹窗拍板是否出手救场！',
      factIds: [],
    };
  }
  const crisis = (state.sectCrisis ??= createInitialSectCrisis());
  const spec = getCurrentCrisisSpec(crisis.chapterIndex);
  const champion = pickStrongestChampion(state, challengerMemberId);
  if (!champion) {
    return { ok: false, message: '宗门暂无可登台迎战的活跃门人。', factIds: [] };
  }

  const eff = getChampionEffectivePower(champion);
  if (eff.totalPower >= spec.opponent.powerScore) {
    const res = applyCrisisVictory(state, spec, champion, 'direct');
    return {
      ok: true,
      message: `护山大捷！${champion.name} 正面击退「${spec.opponent.name}」，迈入下一幕危机！`,
      factIds: [res.factId],
    };
  }

  // 战力尚逊一筹，进入2拍绝境定格，交由玩家抉择是否出手开挂救场
  champion.hp = Math.max(8, Math.floor(champion.maxHp * 0.15));
  const clutch: PendingClutchCrisis = {
    id: nextEntityId(state, 'clutch'),
    kind: 'crisis_showdown',
    title: `${spec.badge} · 护山绝境读秒`,
    actorId: champion.id,
    actorName: champion.name,
    actorPortraitId: champion.portraitId,
    opponentName: spec.opponent.name,
    opponentTitle: spec.opponent.title,
    opponentPortraitId: spec.opponent.portraitId,
    beats: [
      `第1合：${spec.opponent.name}（战力 ${spec.opponent.powerScore}）一式「${spec.opponent.knownMethod}」劈碎护台石柱！`,
      `第2合：${champion.name}（综合战力 ${eff.totalPower}）硬扛余威护阵未退，气血骤跌至最后 ${champion.hp} 点，下一息便是生死关头！`,
    ],
    crisisPrompt: `${champion.name} 已被强敌逼至悬崖边，此刻全宗注视着擂台。是否动用系统底牌，或看他自己燃寿死磕？`,
    futureCost: 14,
    aegisCost: 10,
    spawnedAtTick: state.tick,
  };
  state.pendingClutch = clutch;

  const f = appendFact(state, {
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: champion.id,
    actorIds: [champion.id],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【绝境警报】${champion.name} 在护山决战中濒危（敌战力 ${spec.opponent.powerScore} vs 己方 ${eff.totalPower}），时间已定格等待你拍板！`,
    cueTier: 'notable',
  });

  return {
    ok: true,
    message: `${champion.name} 血战落入生死绝境！请立即在定格弹窗拍板是否救场！`,
    factIds: [f.id],
  };
}

export function resolvePendingClutch(
  state: WorldState,
  _commandId: string,
  clutchId: string,
  choice: ClutchChoiceKey,
): { ok: boolean; message: string; factIds: string[] } {
  const clutch = state.pendingClutch;
  if (!clutch || clutch.id !== clutchId) {
    return { ok: false, message: '该生死危机已经过去。', factIds: [] };
  }

  const actor = state.members.find((m) => m.id === clutch.actorId);
  if (!actor) {
    state.pendingClutch = null;
    return { ok: false, message: '对应弟子状态已变更，危机解除。', factIds: [] };
  }

  if (choice === 'future_strike' && state.daoyuanAvailable < clutch.futureCost) {
    return {
      ok: false,
      message: `可用道源不足（借一式未来身需 ${clutch.futureCost} 点，当前仅余 ${state.daoyuanAvailable} 点，可改选燃寿或旁观）。`,
      factIds: [],
    };
  }
  if (choice === 'immortal_aegis' && state.daoyuanAvailable < clutch.aegisCost) {
    return {
      ok: false,
      message: `可用道源不足（九息不灭金身需 ${clutch.aegisCost} 点，当前仅余 ${state.daoyuanAvailable} 点）。`,
      factIds: [],
    };
  }

  state.pendingClutch = null;

  if (clutch.kind === 'crisis_showdown') {
    const crisis = (state.sectCrisis ??= createInitialSectCrisis());
    const spec = getCurrentCrisisSpec(crisis.chapterIndex);

    if (choice === 'future_strike') {
      state.daoyuanAvailable -= clutch.futureCost;
      actor.hp = actor.maxHp;
      actor.qi = actor.maxQi;
      actor.injuries = [];
      if (!actor.knownMethods.includes('method_qinglian_huifeng')) {
        actor.knownMethods.push('method_qinglian_huifeng');
      }
      const turns: BattleTurn[] = [
        {
          turn: 1,
          actorName: spec.opponent.name,
          action: spec.opponent.knownMethod,
          detail: `${spec.opponent.name} 得意冷笑，第二记绝杀已悬在 ${actor.name} 眉心三寸！`,
          damage: 0,
          targetRemainingHp: actor.hp,
        },
        {
          turn: 2,
          actorName: actor.name,
          action: '神通·借一式未来身',
          detail: `${actor.name} 识海忽涌十年后大成的无上剑意，一剑倒卷千丈灵火，反将 ${spec.opponent.name} 连剑带人劈出山门！`,
          damage: spec.opponent.maxHp,
          targetRemainingHp: 0,
        },
      ];
      const res = applyCrisisVictory(state, spec, actor, 'future_strike', turns);
      return {
        ok: true,
        message: `一式未来身惊艳四座！${actor.name} 当众逆转反杀，成功护匾破局！`,
        factIds: [res.factId],
      };
    }

    if (choice === 'immortal_aegis') {
      state.daoyuanAvailable -= clutch.aegisCost;
      actor.hp = actor.maxHp;
      actor.qi = actor.maxQi;
      actor.injuries = [];
      const turns: BattleTurn[] = [
        {
          turn: 1,
          actorName: spec.opponent.name,
          action: spec.opponent.knownMethod,
          detail: `${spec.opponent.name} 全力轰中护心处，却震出一圈九息不灭的古铜金纹！`,
          damage: 0,
          targetRemainingHp: actor.hp,
        },
        {
          turn: 2,
          actorName: actor.name,
          action: '金身反震破局',
          detail: `${actor.name} 借九息无敌硬吞对方全部真元反震，${spec.opponent.name} 震断长剑吐血退走！`,
          damage: spec.opponent.maxHp,
          targetRemainingHp: 0,
        },
      ];
      const res = applyCrisisVictory(state, spec, actor, 'immortal_aegis', turns);
      return {
        ok: true,
        message: `九息金身稳如泰山！${actor.name} 硬接绝杀反震退敌！`,
        factIds: [res.factId],
      };
    }

    if (choice === 'burn_lifespan') {
      actor.lifespanYears = Math.max(actor.ageYears + 5, actor.lifespanYears - 15);
      actor.hp = Math.max(12, Math.floor(actor.maxHp * 0.35));
      if (!actor.injuries.includes('燃寿余震')) {
        actor.injuries.push('燃寿余震');
      }
      const turns: BattleTurn[] = [
        {
          turn: 1,
          actorName: actor.name,
          action: '燃寿拼命',
          detail: `${actor.name} 两鬓骤霜，暗燃十五载寿元硬冲境界壁垒，双目赤亮迎剑而上！`,
          damage: Math.round(spec.opponent.maxHp * 0.5),
          targetRemainingHp: Math.round(spec.opponent.maxHp * 0.5),
        },
        {
          turn: 2,
          actorName: actor.name,
          action: '绝命碎匾击',
          detail: `以伤换伤硬生生将 ${spec.opponent.name} 逼下擂台，血染石阶护住全宗牌匾！`,
          damage: Math.round(spec.opponent.maxHp * 0.5),
          targetRemainingHp: 0,
        },
      ];
      const res = applyCrisisVictory(state, spec, actor, 'burn_lifespan', turns);
      return {
        ok: true,
        message: `${actor.name} 暗燃 15 岁寿元惨胜护匾！一文道源未花，却添一份沉甸甸的因果。`,
        factIds: [res.factId],
      };
    }

    const def = applyCrisisDefeat(state, spec, actor, true);
    return {
      ok: true,
      message: `${actor.name} 暂退养锐，全宗触发「越挫越勇」（吐纳 +40%）并获系统安慰补贴 +10 道源！`,
      factIds: [def.factId],
    };
  }

  // 虎狼猛药走火危机结算
  if (choice === 'future_strike' || choice === 'immortal_aegis') {
    const cost = choice === 'future_strike' ? clutch.futureCost : clutch.aegisCost;
    state.daoyuanAvailable -= cost;
    actor.hp = actor.maxHp;
    actor.qi = actor.maxQi;
    actor.injuries = [];
    actor.foundation += 4;
    actor.aptitude.bone = Math.min(99, actor.aptitude.bone + 7);
    const ch = applyCultivationDelta(actor, Math.max(150, actor.meridianCapPerRound * 18));
    if (!actor.knownMethods.includes('method_jinglei_jue')) {
      actor.knownMethods.push('method_jinglei_jue');
    }
    const f = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [actor.id],
      publicSummary: `${actor.name} 强冲功法险些经脉寸断，关键一息竟然奇迹般化煞为灵，修为狂涨 +${ch.delta} 缕、根骨暴升！`,
      privateSummary: null,
      systemSummary: `【绝境保驾成功】消耗 ${cost} 道源化险为夷，${actor.name} 修为大涨 +${ch.delta} 缕并悟出《惊雷破邪诀》！`,
      cueTier: 'major',
    });
    appendDramaScene(state, {
      title: `${actor.name} · 化煞成龙`,
      badge: '险中求富贵',
      tone: 'clutch',
      actorId: actor.id,
      actorName: actor.name,
      portraitId: actor.portraitId,
      beats: [
        ...clutch.beats,
        `危急一刹金光镇住狂暴真元，${actor.name} 不退反进一口吞尽残煞，修为涨 +${ch.delta} 缕！`,
      ],
      systemTruth: `你先下虎狼猛药逼出潜力，再在走火读秒时耗 ${cost} 道源出手兜底，生生替他抢回天大造化。`,
      hostDelusion: `${actor.name} 满脸震撼跪拜洞府：「前辈设此死关原是为了打碎我旧脉，险处真有仙缘！」`,
      publicShock: `药庐长老把脉后直呼怪事：「方才灵气乱撞明明必废无疑，怎的一眨眼反而脱胎换骨？」`,
    });
    return { ok: true, message: `出手兜底成功！${actor.name} 化煞成龙，修为 +${ch.delta} 缕！`, factIds: [f.id] };
  }

  if (choice === 'burn_lifespan') {
    actor.lifespanYears = Math.max(actor.ageYears + 5, actor.lifespanYears - 15);
    actor.foundation += 4;
    const ch = applyCultivationDelta(actor, 140);
    if (!actor.injuries.includes('强冲经脉隐伤')) {
      actor.injuries.push('强冲经脉隐伤');
    }
    const f = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [actor.id],
      publicSummary: `${actor.name} 宁折不弯硬生生扛过真元反噬，虽折损寿元却强提 +${ch.delta} 缕修为！`,
      privateSummary: null,
      systemSummary: `${actor.name} 自损 15 岁寿元硬咽猛药，修为 +${ch.delta} 缕。`,
      cueTier: 'major',
    });
    appendDramaScene(state, {
      title: `${actor.name} · 狠人吞药`,
      badge: '暗燃寿元',
      tone: 'clutch',
      actorId: actor.id,
      actorName: actor.name,
      portraitId: actor.portraitId,
      beats: [...clutch.beats, `${actor.name} 狠心自损十五载生机压住反噬，强行收束暴涨的 ${ch.delta} 缕真元！`],
      systemTruth: `零道源消耗！${actor.name} 自己拿十五岁寿元替你填平了猛药风险。`,
      hostDelusion: `${actor.name} 冷笑抹去鼻血：「想要大机缘哪能不拼命？这一关我总算撑过去了！」`,
      publicShock: `同门夜里听见静室轰鸣心惊胆战，次日却见他气息更胜从前！`,
    });
    return { ok: true, message: `${actor.name} 硬扛反噬吞下 +${ch.delta} 缕修为（寿元 -15 岁）。`, factIds: [f.id] };
  }

  // 冷眼旁观 -> 走火重伤
  actor.hp = Math.max(8, Math.floor(actor.maxHp * 0.2));
  if (!actor.injuries.includes('走火震脉伤')) {
    actor.injuries.push('走火震脉伤');
  }
  const f = appendFact(state, {
    type: 'cultivation.progressed',
    visibility: 'public',
    recipientId: null,
    actorIds: [actor.id],
    publicSummary: `${actor.name} 夜间急功近利行功走火，口吐鲜血在静室养伤调息。`,
    privateSummary: null,
    systemSummary: `【冷眼旁观】你选择省下道源，${actor.name} 走火负伤。`,
    cueTier: 'notable',
  });
  appendDramaScene(state, {
    title: `${actor.name} · 急功走火`,
    badge: '顺其天命',
    tone: 'clutch',
    actorId: actor.id,
    actorName: actor.name,
    portraitId: actor.portraitId,
    beats: [...clutch.beats, `暴走灵气撞破三寸经脉，${actor.name} 闷哼倒地，只得闭门养伤。`],
    systemTruth: `赌高回报虎狼药失败，但你拒绝替他掏道源兜底，留作一次教训。`,
    hostDelusion: `${actor.name} 咳血苦笑：「是我自己心浮气躁、接不住前辈赐下的机缘，怨不得旁人。」`,
    publicShock: `丹堂赶紧送去两瓶疗伤散，众弟子暗自引以为戒不敢再冒险急冲。`,
  });
  return { ok: true, message: `${actor.name} 行功走火暂且养伤（道源丝毫未损）。`, factIds: [f.id] };
}

export function stepSectCrisis(state: WorldState): void {
  const crisis = (state.sectCrisis ??= createInitialSectCrisis());
  if (state.pendingClutch) return;
  if (state.tick < crisis.deadlineTick) return;

  const spec = getCurrentCrisisSpec(crisis.chapterIndex);
  const champion = pickStrongestChampion(state);
  if (!champion) {
    crisis.deadlineTick = state.tick + 12 * TICKS_PER_DAY;
    return;
  }

  const eff = getChampionEffectivePower(champion);
  if (eff.totalPower >= spec.opponent.powerScore) {
    applyCrisisVictory(state, spec, champion, 'deadline_win');
  } else {
    applyCrisisDefeat(state, spec, champion, false);
  }
}
