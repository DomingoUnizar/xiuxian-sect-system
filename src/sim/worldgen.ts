import { CONTENT_VERSION, RNG_VERSION, RULES_VERSION, SCHEMA_VERSION } from './constants';
import candidatesPool from '../content/candidates_pool.json';
import { createInitialSectCrisis } from './crisis';
import { resolveEntityTraits } from './destinyTraits';
import { createStreamRng } from './prng';
import type {
  ArenaOpponent,
  Candidate,
  Fact,
  Member,
  RecruitmentSession,
  WorldState,
} from './types';

const SECT_NAMES = ['苍梧门', '听泉阁', '栖霞宗', '青蘅山庄', '玄松别院'] as const;

const FAMILY_NAMES = ['林', '陆', '沈', '苏', '顾', '叶', '江', '谢', '唐', '周', '宋', '许'] as const;
const GIVEN_NAMES_A = ['言', '清', '知', '玄', '宁', '怀', '昭', '景', '墨', '衍', '青', '微'] as const;
const GIVEN_NAMES_B = ['风', '月', '禾', '川', '安', '岚', '舟', '明', '竹', '尘', '音', '远'] as const;

function pickName(rng: ReturnType<typeof createStreamRng>, usedNames: Set<string>): string {
  for (let i = 0; i < 30; i += 1) {
    const f = rng.pick(FAMILY_NAMES);
    const a = rng.pick(GIVEN_NAMES_A);
    const b = rng.nextFloat() > 0.35 ? rng.pick(GIVEN_NAMES_B) : '';
    const full = `${f}${a}${b}`;
    if (!usedNames.has(full)) {
      usedNames.add(full);
      return full;
    }
  }
  const fallback = `陈弟子${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

export function generateCandidatesForSession(
  worldSeed: number,
  generation: number,
  regionId: string,
  sessionId: string,
  sectReputation: number,
  existingNames: Iterable<string>,
  veinLevel = 1,
): Candidate[] {
  const rng = createStreamRng(worldSeed, 'recruitment', `${regionId}:gen-${generation}`, 0);
  const usedNames = new Set(existingNames);

  // 确保首届开山至少包含一名具备“运丹火 + 试剑起手”、尚未首炼也未首胜的凡品双栖新人，
  // 以及一名明确提出条件门槛的求师候选，确保任何合理种子均能体验自愿入门、婉言谢绝与 A/B 分岔。
  const templates: Array<{
    archetype: 'versatile_youth' | 'alchemy_apprentice' | 'sword_youth' | 'wandering_crafter';
    portrait: string;
    elementPool: Array<'火' | '木' | '金' | '水' | '土' | '雷' | '风' | '冰'>;
    grade: '凡品' | '地品';
    hasFire: boolean;
    hasSword: boolean;
    alchemyRank: number;
    seatReq: 'outer' | 'alchemy_hall' | 'sword_pavilion';
    seatLabel: string;
    goal: string;
    bgPrefix: string;
  }> = [
    {
      archetype: 'versatile_youth',
      portrait: 'righteous_003',
      elementPool: ['火', '木'],
      grade: '凡品',
      hasFire: true,
      hasSword: true,
      alchemyRank: 1,
      seatReq: 'outer',
      seatLabel: '外门正式席位',
      goal: '立志先炼成一炉入阶丹，也在同境试剑台上闯出名声',
      bgPrefix: '炉坊兼武馆学徒出身，自幼跟着走方丹师烧火辨药，也学过半套剑架。',
    },
    {
      archetype: 'alchemy_apprentice',
      portrait: 'righteous_004',
      elementPool: ['木', '水'],
      grade: rng.nextFloat() < 0.25 + sectReputation * 0.01 ? '地品' : '凡品',
      hasFire: true,
      hasSword: false,
      alchemyRank: 1,
      seatReq: 'alchemy_hall',
      seatLabel: '丹堂师承席（立志专修丹道）',
      goal: '想找一座肯真教炼丹手法的丹堂安身传艺',
      bgPrefix: '南路药铺坐堂学徒，能辨三味药性苏醒先后，非真传丹堂不愿轻拜山门。',
    },
    {
      archetype: 'sword_youth',
      portrait: 'righteous_001',
      elementPool: ['金', '风'],
      grade: '凡品',
      hasFire: false,
      hasSword: true,
      alchemyRank: 0,
      seatReq: 'sword_pavilion',
      seatLabel: '试剑台练剑席（需有切磋同境之机）',
      goal: '求同境对手磨剑，不甘终身困在乡里演武场',
      bgPrefix: '边城镖局少年，常年握铁剑守夜，身手利落但尚未正式引气入室。',
    },
    {
      archetype: 'wandering_crafter',
      portrait: 'mortal_002',
      elementPool: ['土', '火'],
      grade: '凡品',
      hasFire: true,
      hasSword: false,
      alchemyRank: 1,
      seatReq: 'outer',
      seatLabel: '外门正式席位',
      goal: '寻一处安稳山门，靠踏实手艺挣得长生资粮',
      bgPrefix: '坊市采药兼修炉灶的散学青年，性情沉稳，对名门大派并不盲从。',
    },
  ];

  // 根据地域微调出场顺序（同一届仍无放回确定性排列）
  const ordered = rng.shuffle(templates);
  const personalityPool = ['冷静', '好战', '谨慎', '重情', '专研'] as const;

  return ordered.map((tpl, idx) => {
    const name = pickName(rng, usedNames);
    const portraitNum = rng.nextInt(1, 14);
    const portraitId =
      tpl.archetype === 'versatile_youth'
        ? 'righteous_003'
        : tpl.archetype === 'alchemy_apprentice'
          ? 'righteous_004'
          : tpl.archetype === 'wandering_crafter'
            ? rng.pick(['mortal_002', 'mortal_005', 'mortal_006'])
            : `righteous_${String(portraitNum).padStart(3, '0')}`;

    const knownMethods: string[] = [];
    if (tpl.hasFire) knownMethods.push('method_basic_fire');
    if (tpl.hasSword) knownMethods.push('method_basic_sword');

    const compBase = tpl.archetype === 'versatile_youth' ? 58 : 48;
    const boneBase = tpl.archetype === 'sword_youth' ? 62 : 52;
    let finalGrade: Candidate['spiritRoot']['grade'] = tpl.grade;
    if (generation >= 2 && veinLevel >= 2) {
      const rootRoll = rng.nextInt(1, 100);
      if (veinLevel >= 4 && rootRoll <= 28) {
        finalGrade = '天品';
      } else if (rootRoll <= 20 + veinLevel * 14 && finalGrade === '凡品') {
        finalGrade = '地品';
      }
    }

    const regionPool = candidatesPool.filter((entry) => entry.regionId === regionId);
    const archMatches = regionPool.filter((entry) => entry.archetype === tpl.archetype);
    const poolPick =
      generation >= 2 && regionPool.length > 0
        ? (archMatches.length > 0 ? archMatches : regionPool)[
            Math.abs(worldSeed + generation * 7 + idx * 3) %
              (archMatches.length > 0 ? archMatches.length : regionPool.length)
          ]
        : null;

    return {
      id: `cand_${generation}_${idx + 1}`,
      sessionId,
      name,
      portraitId,
      originRegionId: regionId,
      background: poolPick ? poolPick.background : tpl.bgPrefix,
      ageYears: rng.nextInt(15, 22),
      lifespanYears: rng.nextInt(420, 560),
      realm: '炼气',
      realmLayer: tpl.archetype === 'versatile_youth' ? 1 : rng.nextInt(1, 2),
      cultivation: tpl.archetype === 'versatile_youth' ? 60 : rng.nextInt(42, 74),
      spiritRoot: {
        elements: tpl.elementPool.slice(0, rng.nextInt(1, 2)) as Candidate['spiritRoot']['elements'],
        grade: finalGrade,
      },
      aptitude: {
        comprehension: compBase + rng.nextInt(0, 18),
        bone: boneBase + rng.nextInt(0, 18),
        soul: 50 + rng.nextInt(0, 20),
        mindset: 52 + rng.nextInt(0, 20),
        luck: 45 + rng.nextInt(0, 25),
      },
      personality: tpl.archetype === 'versatile_youth' ? '冷静' : rng.pick(personalityPool),
      personalGoal: poolPick ? poolPick.personalGoal : tpl.goal,
      auditionLine: poolPick?.auditionLine,
      acceptLine: poolPick?.acceptLine,
      declineLine: poolPick?.declineLine,
      craftRank: {
        alchemy: tpl.alchemyRank,
        forging: generation >= 2 ? ((worldSeed + generation + idx) % 2 === 0 ? 1 : 0) : 0,
        array: generation >= 2 ? ((worldSeed + generation * 3 + idx) % 3 === 0 ? 1 : 0) : 0,
        talisman: generation >= 2 ? ((worldSeed + generation * 5 + idx) % 3 === 0 ? 1 : 0) : 0,
      },
      knownMethods,
      hasAlchemyFire: tpl.hasFire,
      hasSwordStance: tpl.hasSword,
      // 洞府 9 / 经脉 8 / 心法 8 => 常态每轮精确 8 缕，十轮修为灌注即 80 缕
      caveSupplyPerRound: 9,
      meridianCapPerRound: 8,
      manualRatePerRound: 8,
      requirement: {
        minSeatTier: tpl.seatReq,
        label: tpl.seatLabel,
      },
      auditioned: false,
      outcome: 'pending',
      decisionReason: null,
      joinedMemberId: null,
      destinyTraits: resolveEntityTraits(worldSeed, `cand_${generation}_${idx + 1}`, finalGrade),
    };
  });
}

export function createInitialWorld(seed = 20261123): WorldState {
  const rng = createStreamRng(seed, 'worldgen', 'founding', 0);
  const sectName = rng.pick(SECT_NAMES);
  const usedNames = new Set<string>();

  const masterName = pickName(rng, usedNames);
  const alchemyElderName = pickName(rng, usedNames);
  const recruitElderName = pickName(rng, usedNames);
  const seniorDiscipleName = pickName(rng, usedNames);
  const departedName = pickName(rng, usedNames);

  const members: Member[] = [
    {
      id: 'member_master',
      name: masterName,
      role: 'sect_master',
      status: 'active',
      portraitId: 'righteous_049',
      originRegionId: 'zhongzhou',
      background: '开山立宗之主，于筑基期勉力撑起山门与灵脉阵眼。',
      ageYears: 148,
      lifespanYears: 1400,
      realm: '筑基',
      realmLayer: 1,
      cultivation: 320,
      cultivationCap: 600,
      foundation: 14,
      caveSupplyPerRound: 12,
      meridianCapPerRound: 10,
      manualRatePerRound: 9,
      hp: 150,
      maxHp: 150,
      qi: 120,
      maxQi: 120,
      pillToxicity: 0,
      spiritRoot: { elements: ['木', '火'], grade: '地品' },
      aptitude: { comprehension: 74, bone: 70, soul: 72, mindset: 78, luck: 60 },
      personality: '冷静',
      personalGoal: '重振山门道统，觅得可传衣钵之后辈',
      craftRank: { alchemy: 1, forging: 1, array: 2, talisman: 1 },
      knownMethods: ['method_basic_sword', 'method_qinglian_huifeng', 'method_forging_fengwen'],
      hasAlchemyFire: true,
      hasCompletedFirstAlchemy: true,
      hasWonFirstArena: true,
      unlockedArenaRematch: true,
      equippedWeapon: {
        id: 'wpn_master_01',
        templateId: 'weapon_iron_sword',
        name: '青锋铁剑',
        tier: '凡阶',
        quality: '上品',
        iconPath: 'assets/weapons/sword_t02_006.png',
        durability: 40,
        maxDurability: 40,
        attackBonus: 10,
        defenseBonus: 4,
      },
      pouchPills: {},
      pouchTalismans: 0,
      binding: {
        bound: true,
        bindingId: 'bind_0_master',
        boundAtTick: 0,
        secrecyIntact: true,
      },
      currentActivity: null,
      injuries: [],
      notes: ['开山立宗时即已秘密接入，不可向旁人泄露半字'],
    },
    {
      id: 'member_alchemy_elder',
      name: alchemyElderName,
      role: 'elder',
      status: 'active',
      portraitId: 'righteous_045',
      originRegionId: 'nanjiang',
      background: '丹堂执事长老，手握独门「分火提清法」，惜无人肯沉心接续。',
      ageYears: 116,
      lifespanYears: 620,
      realm: '炼气',
      realmLayer: 8,
      cultivation: 188,
      cultivationCap: 240,
      foundation: 11,
      caveSupplyPerRound: 10,
      meridianCapPerRound: 9,
      manualRatePerRound: 9,
      hp: 104,
      maxHp: 104,
      qi: 96,
      maxQi: 96,
      pillToxicity: 0,
      spiritRoot: { elements: ['火', '木'], grade: '地品' },
      aptitude: { comprehension: 76, bone: 58, soul: 74, mindset: 72, luck: 55 },
      personality: '专研',
      personalGoal: '亲见一名后学弟子独立使出分火提清法成丹',
      craftRank: { alchemy: 2, forging: 1, array: 0, talisman: 0 },
      knownMethods: ['method_basic_fire', 'method_fenhuo_tiqing', 'method_forging_ludan'],
      hasAlchemyFire: true,
      hasCompletedFirstAlchemy: true,
      hasWonFirstArena: false,
      unlockedArenaRematch: false,
      equippedWeapon: {
        id: 'wpn_alchemy_seal_01',
        templateId: 'weapon_iron_sword',
        name: '丹堂控火阵印',
        tier: '凡阶',
        quality: '中品',
        iconPath: 'assets/weapons/seal_t02_004.png',
        durability: 36,
        maxDurability: 36,
        attackBonus: 4,
        defenseBonus: 6,
      },
      pouchPills: {},
      pouchTalismans: 0,
      binding: {
        bound: true,
        bindingId: 'bind_0_alchemy_elder',
        boundAtTick: 0,
        secrecyIntact: true,
      },
      currentActivity: null,
      injuries: [],
      notes: ['创法/传法者：已掌握「分火提清法」'],
    },
    {
      id: 'member_recruit_elder',
      name: recruitElderName,
      role: 'elder',
      status: 'active',
      portraitId: 'righteous_011',
      originRegionId: 'zhongzhou',
      background: '外门招生长老，奔走五域递送名帖、核验应试学徒。',
      ageYears: 88,
      lifespanYears: 540,
      realm: '炼气',
      realmLayer: 6,
      cultivation: 142,
      cultivationCap: 200,
      foundation: 9,
      caveSupplyPerRound: 9,
      meridianCapPerRound: 8,
      manualRatePerRound: 8,
      hp: 96,
      maxHp: 96,
      qi: 84,
      maxQi: 84,
      pillToxicity: 0,
      spiritRoot: { elements: ['水', '土'], grade: '凡品' },
      aptitude: { comprehension: 60, bone: 62, soul: 66, mindset: 70, luck: 64 },
      personality: '谨慎',
      personalGoal: '为山门招来真能立得住的门人',
      craftRank: { alchemy: 0, forging: 0, array: 1, talisman: 1 },
      knownMethods: ['method_basic_sword', 'method_beast_xunling'],
      hasAlchemyFire: false,
      hasCompletedFirstAlchemy: false,
      hasWonFirstArena: true,
      unlockedArenaRematch: true,
      equippedWeapon: {
        id: 'wpn_recruit_bell_01',
        templateId: 'weapon_iron_sword',
        name: '护山铜铃',
        tier: '凡阶',
        quality: '下品',
        iconPath: 'assets/weapons/bell_t01_001.png',
        durability: 32,
        maxDurability: 32,
        attackBonus: 3,
        defenseBonus: 5,
      },
      pouchPills: {},
      pouchTalismans: 0,
      binding: {
        bound: true,
        bindingId: 'bind_0_recruit_elder',
        boundAtTick: 0,
        secrecyIntact: true,
      },
      currentActivity: null,
      injuries: [],
      notes: [],
    },
    {
      id: 'member_senior_disciple',
      name: seniorDiscipleName,
      role: 'disciple',
      status: 'active',
      portraitId: 'righteous_009',
      originRegionId: 'beihuang',
      background: '入门最早的大师兄，平日负责护山巡查与采药照应。',
      ageYears: 27,
      lifespanYears: 480,
      realm: '炼气',
      realmLayer: 4,
      cultivation: 118,
      cultivationCap: 160,
      foundation: 8,
      caveSupplyPerRound: 9,
      meridianCapPerRound: 8,
      manualRatePerRound: 8,
      hp: 92,
      maxHp: 92,
      qi: 78,
      maxQi: 78,
      pillToxicity: 0,
      spiritRoot: { elements: ['金'], grade: '凡品' },
      aptitude: { comprehension: 56, bone: 71, soul: 54, mindset: 68, luck: 52 },
      personality: '重情',
      personalGoal: '护住同门，早日摸到炼气后期的门槛',
      craftRank: { alchemy: 0, forging: 0, array: 0, talisman: 0 },
      knownMethods: ['method_basic_sword'],
      hasAlchemyFire: false,
      hasCompletedFirstAlchemy: false,
      hasWonFirstArena: true,
      unlockedArenaRematch: true,
      equippedWeapon: {
        id: 'wpn_senior_01',
        templateId: 'weapon_iron_sword',
        name: '凡阶铁剑',
        tier: '凡阶',
        quality: '下品',
        iconPath: 'assets/weapons/sword_t01_001.png',
        durability: 28,
        maxDurability: 30,
        attackBonus: 6,
        defenseBonus: 2,
      },
      pouchPills: {},
      pouchTalismans: 0,
      binding: {
        bound: true,
        bindingId: 'bind_0_senior',
        boundAtTick: 0,
        secrecyIntact: true,
      },
      currentActivity: null,
      injuries: [],
      notes: [],
    },
    {
      id: 'member_departed_01',
      name: departedName,
      role: 'disciple',
      status: 'departed',
      portraitId: 'mortal_001',
      originRegionId: 'dongyu',
      background: '早年曾在山门帮忙炮制药草，后因家事正式拜别退宗返乡。',
      ageYears: 34,
      lifespanYears: 430,
      realm: '炼气',
      realmLayer: 2,
      cultivation: 78,
      cultivationCap: 140,
      foundation: 6,
      caveSupplyPerRound: 8,
      meridianCapPerRound: 8,
      manualRatePerRound: 8,
      hp: 84,
      maxHp: 84,
      qi: 66,
      maxQi: 66,
      pillToxicity: 0,
      spiritRoot: { elements: ['木'], grade: '凡品' },
      aptitude: { comprehension: 52, bone: 50, soul: 58, mindset: 66, luck: 50 },
      personality: '重情',
      personalGoal: '安稳行医济世',
      craftRank: { alchemy: 1, forging: 0, array: 0, talisman: 0 },
      knownMethods: ['method_basic_fire'],
      hasAlchemyFire: true,
      hasCompletedFirstAlchemy: true,
      hasWonFirstArena: false,
      unlockedArenaRematch: false,
      equippedWeapon: {
        id: 'wpn_alchemy_seal_01',
        templateId: 'weapon_iron_sword',
        name: '丹堂控火阵印',
        tier: '凡阶',
        quality: '中品',
        iconPath: 'assets/weapons/seal_t02_004.png',
        durability: 36,
        maxDurability: 36,
        attackBonus: 4,
        defenseBonus: 6,
      },
      pouchPills: {},
      pouchTalismans: 0,
      binding: {
        bound: true,
        bindingId: 'bind_0_departed',
        boundAtTick: 0,
        secrecyIntact: true,
      },
      currentActivity: null,
      injuries: [],
      notes: ['已正式退宗：停收新私令，仍保留经历与保密约束'],
    },
  ];

  for (const m of members) {
    m.destinyTraits = resolveEntityTraits(seed, m.id, m.spiritRoot.grade);
  }

  const sessionId = 'recruit_gen_1';
  const candidates = generateCandidatesForSession(
    seed,
    1,
    'zhongzhou',
    sessionId,
    10,
    members.map((m) => m.name),
  );

  const recruitment: RecruitmentSession = {
    id: sessionId,
    generation: 1,
    regionId: 'zhongzhou',
    totalSeats: 2,
    remainingSeats: 2,
    openedAtTick: 0,
    candidates,
  };

  const arenaOpponents: ArenaOpponent[] = [
    {
      id: 'opp_arena_01',
      name: '周墨',
      title: '试剑台外门守擂弟子',
      portraitId: 'righteous_013',
      realm: '炼气',
      realmLayer: 1,
      powerScore: 90,
      maxHp: 74,
      attack: 17,
      defense: 6,
      evasion: 46,
      knownMethod: '青松试剑势',
      available: true,
    },
    {
      id: 'opp_arena_02',
      name: '顾长风',
      title: '复赛挑战席擂主',
      portraitId: 'righteous_014',
      realm: '炼气',
      realmLayer: 3,
      powerScore: 103,
      maxHp: 90,
      attack: 22,
      defense: 9,
      evasion: 50,
      knownMethod: '青莲回锋诀（残）',
      available: true,
    },
  ];

  const initialPublicFact: Fact = {
    id: 'fact_1',
    seq: 1,
    tick: 0,
    type: 'world.founded',
    visibility: 'public',
    recipientId: null,
    actorIds: ['member_master', 'member_alchemy_elder', 'member_recruit_elder', 'member_senior_disciple'],
    causeIds: [],
    publicSummary: `${sectName}开山立宗，宗主${masterName}率诸位长老门人整顿洞府与丹堂，首届招贤名帖已发往中州。`,
    privateSummary: null,
    systemSummary: `${sectName}开山立宗，宗主${masterName}率诸位长老门人整顿洞府与丹堂，首届招贤名帖已发往中州。`,
    cueTier: 'routine',
  };

  const initialSystemFact: Fact = {
    id: 'fact_2',
    seq: 2,
    tick: 0,
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [],
    causeIds: ['fact_1'],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【叮！宗门系统已接入${sectName}】全宗在籍 4 人秘密绑定完毕（1 名旧人已退宗停令）。初始可用道源 24，道统根基 0。`,
    cueTier: 'routine',
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    contentVersion: CONTENT_VERSION,
    rngVersion: RNG_VERSION,
    seed,
    sectName,
    sectReputation: 10,
    sectFocus: 'balanced',
    tick: 0,
    daoyuanAvailable: 24,
    daoyuanReserved: 0,
    foundationPoints: 0,
    unlockedPermissions: ['initial'],
    members,
    recruitment,
    inventory: {
      furnaces: 1,
      furnaceHasWarmCore: false,
      herbs: {
        herb_ningling: 12,
        herb_huiqi: 6,
        herb_humai: 4,
        mat_dew_petals: 1,
      },
      materials: {
        mat_chaowen_jade: 3,
      },
      pills: {
        pill_ningling_1_low: 1,
      },
      talismans: {
        talisman_escape: 2,
      },
      weapons: [
        {
          id: 'wpn_vault_sword_01',
          templateId: 'weapon_iron_sword',
          name: '凡阶铁剑',
          tier: '凡阶',
          quality: '下品',
          iconPath: 'assets/weapons/sword_t01_001.png',
          durability: 30,
          maxDurability: 30,
          attackBonus: 6,
          defenseBonus: 2,
        },
      ],
      spiritStones: {
        low: 120,
        mid: 0,
        high: 0,
        supreme: 0,
      },
    },
    arenaOpponents,
    missions: [],
    reservations: [],
    ledger: [],
    facts: [initialPublicFact, initialSystemFact],
    battleFacts: {},
    alchemyFacts: {},
    forgingFacts: {},
    beastFacts: {},
    spiritBeasts: [
      {
        id: 'beast_sect_deer',
        name: '听泉云纹鹿',
        species: '云纹灵鹿',
        portraitId: 'beast_004',
        traits: ['伏耳听泉', '轻步衔花'],
        awakened: false,
        bondedMemberId: 'member_recruit_elder',
      },
      {
        id: 'beast_sect_hound',
        name: '巡风苍青犬',
        species: '巡山灵犬',
        portraitId: 'beast_005',
        traits: ['闻矿辨踪', '循铃应声'],
        awakened: false,
        bondedMemberId: null,
      },
    ],
    tournaments: [],
    activePhenomenon: null,
    conquestStage: 0,
    autoDispatchEnabled: false,
    sectSpiritVeinLevel: 1,
    pendingEncounter: null,
    resolvedEncounterCount: 0,
    heritages: [],
    standingBounties: [],
    sectCrisis: createInitialSectCrisis(),
    pendingClutch: null,
    dramaLogs: [],
    activeDuel: null,
    systemXp: 0,
    systemLevel: 0,
    activePerks: [],
    pendingPerkChoices: null,
    receipts: {},
    nextFactSeq: 3,
    nextEntitySeq: 10,
    rngAttemptCounters: {},
  };
}
