import { applyCultivationDelta } from './cultivation';
import { appendFact, nextEntityId } from './facts';
import { checkAndUnlockPermissions } from './heritage';
import { computeMemberPowerScore } from './power';
import { createStreamRng } from './prng';
import type { HostEquipment, Member, SectEncounter, WorldState } from './types';

interface EncounterTemplate {
  id: string;
  tag: string;
  title: string;
  buildNarrative: (actor: Member) => string;
  choiceA: { label: string; hint: string; stoneCostLow?: number; daoyuanCost?: number };
  choiceB: { label: string; hint: string; stoneCostLow?: number; daoyuanCost?: number };
}

const ENCOUNTER_TEMPLATES: EncounterTemplate[] = [
  {
    id: 'enc_tuihun',
    tag: '十年打脸',
    title: '山门退婚帖 · 三十年河西',
    buildNarrative: (actor) =>
      `中州世家使者竟持金帖登门，替旧日未婚方当众退婚羞辱 ${actor.name}，山门弟子尽皆侧目！`,
    choiceA: {
      label: '怒立三年之约（暗助逆袭）',
      hint: '耗 10 道源激发傲骨：修为 +160 缕、悟性 +8、声望 +15',
      daoyuanCost: 10,
    },
    choiceB: {
      label: '当众索赔灵石遣走使者',
      hint: '无损耗：直接净赚下品灵石 +90、宗门根基 +1',
    },
  },
  {
    id: 'enc_sword_cave',
    tag: '坠崖秘境',
    title: '寒鸦谷底 · 古剑修遗蜕',
    buildNarrative: (actor) =>
      `${actor.name} 采药失足跌入一处尘封剑窟，石壁刻有《惊雷破邪诀》残意与一具盘坐古尸！`,
    choiceA: {
      label: '敬奉香火承接完整剑意',
      hint: '修为 +140 缕、必悟玄阶《惊雷破邪诀》、道统根基 +1',
    },
    choiceB: {
      label: '摸走古尸须弥戒秘藏',
      hint: '直接暴获下品灵石 +110、中品灵石 +1、护脉丹 ×1',
    },
  },
  {
    id: 'enc_earth_fire',
    tag: '异火认主',
    title: '地脉赤炎动 · 青莲火种现世',
    buildNarrative: (actor) =>
      `丹霞药庐地底骤然喷涌赤金灵焰，一朵微弱青莲火种环绕 ${actor.name} 旋转试探！`,
    choiceA: {
      label: '耗灵石稳脉收服异火',
      hint: '耗 50 下品灵石：丹道 +2 品、气运 +10、每轮吸收 +4',
      stoneCostLow: 50,
    },
    choiceB: {
      label: '引火温炉连炼极品圣丹',
      hint: '无损耗：丹库立得「二阶极品护脉丹 × 3」、道源 +12',
    },
  },
  {
    id: 'enc_market_steal',
    tag: '坊市捡漏',
    title: '西漠旧摊 · 蒙尘玄铁剑胚',
    buildNarrative: (actor) =>
      `${actor.name} 游历旧坊时，在一堆废铜烂铁中察觉一截似有微弱剑吟的玄铁古胚！`,
    choiceA: {
      label: '低价买下重铸神兵',
      hint: '耗 60 下品灵石：直获地阶上品「太虚断岳剑」(攻+112)入库',
      stoneCostLow: 60,
    },
    choiceB: {
      label: '揭穿阵纹转手倒卖给豪商',
      hint: '无损耗：净赚下品灵石 +120、道源 +15',
    },
  },
  {
    id: 'enc_thunder_temper',
    tag: '天劫锻骨',
    title: '九霄残雷降 · 雷纹淬体之机',
    buildNarrative: (actor) =>
      `山巅劫云无端压顶，一道残留紫霄精雷垂落，正对正在行功的 ${actor.name}！`,
    choiceA: {
      label: '引雷入体强行淬骨',
      hint: '根骨 +12、气血上限 +80、修为 +120 缕、根基 +1',
    },
    choiceB: {
      label: '设阵引雷化作纯粹道源',
      hint: '护持门人平安并当场截留 +28 点可用道源',
    },
  },
  {
    id: 'enc_poach_reject',
    tag: '忠诚试金',
    title: '外宗重礼挖角 · 风波起',
    buildNarrative: (actor) =>
      `邻域大派密使暗中递来重金名帖，开出真传高位欲拉拢 ${actor.name} 改投门庭！`,
    choiceA: {
      label: '严词斥回扬我山门威风',
      hint: '声望 +25、全宗心性 +8、道源 +18、根基 +1',
    },
    choiceB: {
      label: '反套出对方山门秘库图谱',
      hint: '获中品灵石 +2、凝灵/护脉草各 +6、修为 +90 缕',
    },
  },
  {
    id: 'enc_beast_egg',
    tag: '灵宠奇缘',
    title: '灵泉古潭 · 灵兽衔回古雷蛋',
    buildNarrative: (actor) =>
      `${actor.name} 巡视灵泉时，山门灵兽竟衔回一颗刻有天然八卦纹路的温热古蛋！`,
    choiceA: {
      label: '灵石温养唤醒全部灵兽血脉',
      hint: '耗 40 下品灵石：全宗灵兽觉醒！道统根基 +2、道源 +15',
      stoneCostLow: 40,
    },
    choiceB: {
      label: '以古蛋药气化浆补给丹库',
      hint: '立得二阶极品护脉丹 × 2、带露玉髓花 × 3、潮纹玉 × 2',
    },
  },
  {
    id: 'enc_stele_enlighten',
    tag: '古碑顿悟',
    title: '藏经阁旧碑 · 先贤残意苏醒',
    buildNarrative: (actor) =>
      `承法藏经阁后院的无字旧碑无风自鸣，浮现开派祖师一缕行功真意，只待 ${actor.name} 接引！`,
    choiceA: {
      label: '全神参透祖师行功真意',
      hint: '修为 +180 缕、心法吸收率永久 +3、个人根基 +5',
    },
    choiceB: {
      label: '拓印碑文惠及全宗同门',
      hint: '全宗在籍活跃门人修为各 +60 缕、道统根基 +1',
    },
  },
];

export const ENCOUNTER_FIRST_TICK = 18;
export const ENCOUNTER_INTERVAL_TICKS = 16;

export function stepSectEncounters(state: WorldState): void {
  if (state.tick < ENCOUNTER_FIRST_TICK) return;
  if ((state.tick - ENCOUNTER_FIRST_TICK) % ENCOUNTER_INTERVAL_TICKS !== 0) return;
  if (state.pendingEncounter) return;

  const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
  if (actives.length === 0) return;

  const rng = createStreamRng(state.seed, 'encounter', `tick-${state.tick}`, 0);
  const tpl = rng.pick(ENCOUNTER_TEMPLATES);
  const sortedActives = [...actives].sort((a, b) => a.id.localeCompare(b.id));
  const actor = rng.pick(sortedActives);

  const enc: SectEncounter = {
    id: nextEntityId(state, 'enc'),
    templateId: tpl.id,
    title: tpl.title,
    tag: tpl.tag,
    actorId: actor.id,
    actorName: actor.name,
    portraitId: actor.portraitId,
    narrative: tpl.buildNarrative(actor),
    spawnedAtTick: state.tick,
    choices: [
      { key: 'a', ...tpl.choiceA },
      { key: 'b', ...tpl.choiceB },
    ],
  };
  state.pendingEncounter = enc;

  appendFact(state, {
    type: 'system.advanced',
    visibility: 'system_only',
    recipientId: null,
    actorIds: [actor.id],
    publicSummary: null,
    privateSummary: null,
    systemSummary: `【叮！天机奇遇降临】「${enc.title}」已在 ${actor.name} 身上触发，请于右上「天机感应盘」亲自拍板抉择！`,
    cueTier: 'notable',
  });
}

export function resolveSectEncounter(
  state: WorldState,
  commandId: string,
  encounterId: string,
  choiceKey: 'a' | 'b',
): { ok: boolean; message: string; factIds: string[] } {
  const enc = state.pendingEncounter;
  if (!enc || enc.id !== encounterId) {
    return { ok: false, message: '该桩天机奇遇已经尘埃落定。', factIds: [] };
  }

  const chosenSpec = enc.choices.find((c) => c.key === choiceKey);
  if (!chosenSpec) {
    return { ok: false, message: '未知奇遇抉择。', factIds: [] };
  }

  if (chosenSpec.stoneCostLow && state.inventory.spiritStones.low < chosenSpec.stoneCostLow) {
    return {
      ok: false,
      message: `下品灵石不足（该选需 ${chosenSpec.stoneCostLow} 枚，可先看另一选项）。`,
      factIds: [],
    };
  }
  if (chosenSpec.daoyuanCost && state.daoyuanAvailable < chosenSpec.daoyuanCost) {
    return {
      ok: false,
      message: `可用道源不足（该选需 ${chosenSpec.daoyuanCost} 点，可改选另一分支）。`,
      factIds: [],
    };
  }

  const actor =
    state.members.find((m) => m.id === enc.actorId && m.status === 'active') ??
    state.members.find((m) => m.status === 'active' && m.binding.bound);
  if (!actor) {
    state.pendingEncounter = null;
    return { ok: false, message: '宗门眼下无活跃宿主可承接该奇遇。', factIds: [] };
  }

  if (chosenSpec.stoneCostLow) state.inventory.spiritStones.low -= chosenSpec.stoneCostLow;
  if (chosenSpec.daoyuanCost) state.daoyuanAvailable -= chosenSpec.daoyuanCost;

  const beforePower = computeMemberPowerScore(actor);
  let publicLine = '';
  let systemLine = '';
  let gainedFoundation = 0;

  switch (enc.templateId) {
    case 'enc_tuihun': {
      if (choiceKey === 'a') {
        const ch = applyCultivationDelta(actor, 160);
        actor.aptitude.comprehension = Math.min(99, actor.aptitude.comprehension + 8);
        state.sectReputation += 15;
        publicLine = `${actor.name} 当众立下三年之约撕毁退婚帖，一腔傲骨引动灵台大明，修为直涨 +${ch.delta} 缕！`;
        systemLine = `【叮！十年打脸定局】${actor.name} 修为 +${ch.delta} 缕、悟性 +8、声望 +15！`;
      } else {
        state.inventory.spiritStones.low += 90;
        state.foundationPoints += 1;
        gainedFoundation = 1;
        publicLine = `${actor.name} 从容接帖索赔九十块下品灵石赔礼，不卑不亢护全了山门颜面。`;
        systemLine = `【叮！奇遇获赔】净赚下品灵石 +90、道统根基 +1！`;
      }
      break;
    }
    case 'enc_sword_cave': {
      if (choiceKey === 'a') {
        const ch = applyCultivationDelta(actor, 140);
        if (!actor.knownMethods.includes('method_jinglei_jue')) {
          actor.knownMethods.push('method_jinglei_jue');
        }
        actor.manualRatePerRound = Math.max(actor.manualRatePerRound, 10);
        state.foundationPoints += 1;
        gainedFoundation = 1;
        publicLine = `${actor.name} 于寒鸦谷古剑窟诚心拜祭前贤遗蜕，领悟玄阶剑法《惊雷破邪诀》且修为 +${ch.delta} 缕！`;
        systemLine = `【叮！古剑传承】${actor.name} 悟得《惊雷破邪诀》、修为 +${ch.delta} 缕、根基 +1！`;
      } else {
        state.inventory.spiritStones.low += 110;
        state.inventory.spiritStones.mid += 1;
        state.inventory.pills.pill_humai_2_mid = (state.inventory.pills.pill_humai_2_mid ?? 0) + 1;
        publicLine = `${actor.name} 带回谷底古修遗留的一袋灵石与丹瓶，已全数充入宗库。`;
        systemLine = `【叮！摸走古戒宝藏】下品灵石 +110、中品灵石 +1、护脉丹 +1！`;
      }
      break;
    }
    case 'enc_earth_fire': {
      if (choiceKey === 'a') {
        actor.craftRank.alchemy = Math.min(10, actor.craftRank.alchemy + 2);
        actor.hasAlchemyFire = true;
        actor.aptitude.luck = Math.min(99, actor.aptitude.luck + 10);
        actor.caveSupplyPerRound += 4;
        actor.meridianCapPerRound += 4;
        actor.manualRatePerRound = Math.max(actor.manualRatePerRound + 3, actor.meridianCapPerRound);
        publicLine = `${actor.name} 在丹霞地底顺势收服一丝青莲灵焰，丹道火候陡增两品！`;
        systemLine = `【叮！青莲火种认主】${actor.name} 丹道 +2 品、气运 +10、每轮吸收 +4！`;
      } else {
        state.inventory.pills.pill_humai_2_supreme = (state.inventory.pills.pill_humai_2_supreme ?? 0) + 3;
        state.daoyuanAvailable += 12;
        publicLine = `${actor.name} 借地心灵焰一瞬三炉，在丹房连炼出三枚二阶极品护脉丹交入丹库！`;
        systemLine = `【叮！异火成丹】丹库添二阶极品护脉丹 × 3、道源反哺 +12！`;
      }
      break;
    }
    case 'enc_market_steal': {
      if (choiceKey === 'a') {
        const sword: HostEquipment = {
          id: nextEntityId(state, 'wpn'),
          templateId: 'weapon_chaowen_sword',
          name: '太虚断岳剑',
          tier: '地阶',
          quality: '上品',
          iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
          durability: 100,
          maxDurability: 100,
          attackBonus: 112,
          defenseBonus: 40,
          refineLevel: 0,
          specialTrait: 'water_tide',
        };
        state.inventory.weapons.push(sword);
        publicLine = `${actor.name} 在西漠旧摊淘回一截蒙尘古剑胚，重铸擦亮竟是地阶上品神兵「太虚断岳剑」！`;
        systemLine = `【叮！坊市捡漏暴赚】地阶上品「太虚断岳剑」(攻+112)已入百宝阁！`;
      } else {
        state.inventory.spiritStones.low += 120;
        state.daoyuanAvailable += 15;
        publicLine = `${actor.name} 一语点破西漠古剑阵纹并转售豪商，为山门赚回一百二十块下品灵石。`;
        systemLine = `【叮！转手净赚】下品灵石 +120、可用道源 +15！`;
      }
      break;
    }
    case 'enc_thunder_temper': {
      if (choiceKey === 'a') {
        actor.aptitude.bone = Math.min(99, actor.aptitude.bone + 12);
        actor.maxHp += 80;
        actor.hp = actor.maxHp;
        const ch = applyCultivationDelta(actor, 120);
        state.foundationPoints += 1;
        gainedFoundation = 1;
        publicLine = `${actor.name} 于山巅硬撼残余紫霄精雷，雷纹淬骨后体魄与修为（+${ch.delta} 缕）齐升！`;
        systemLine = `【叮！天雷淬体】${actor.name} 根骨 +12、气血上限 +80、修为 +${ch.delta} 缕、根基 +1！`;
      } else {
        state.daoyuanAvailable += 28;
        publicLine = `护山法阵稳稳收束了山巅残雷，保得山门草木皆安。`;
        systemLine = `【叮！截雷化源】当场吸收转化为 +28 点可用道源！`;
      }
      break;
    }
    case 'enc_poach_reject': {
      if (choiceKey === 'a') {
        state.sectReputation += 25;
        state.daoyuanAvailable += 18;
        state.foundationPoints += 1;
        gainedFoundation = 1;
        for (const m of state.members.filter((x) => x.status === 'active')) {
          m.aptitude.mindset = Math.min(99, m.aptitude.mindset + 8);
        }
        publicLine = `${actor.name} 面对外宗重礼面不改色、严词逐客，全宗同门闻之无不心折、心境愈坚！`;
        systemLine = `【叮！忠义扬威】声望 +25、全宗心性 +8、道源 +18、根基 +1！`;
      } else {
        state.inventory.spiritStones.mid += 2;
        state.inventory.herbs.herb_ningling = (state.inventory.herbs.herb_ningling ?? 0) + 6;
        state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 6;
        const ch = applyCultivationDelta(actor, 90);
        publicLine = `${actor.name} 顺势套出邻域散修密藏方位，取回中品灵石×2 与成捆灵草交入宗库。`;
        systemLine = `【叮！智取秘藏】中品灵石 +2、灵草 +12、${actor.name} 修为 +${ch.delta} 缕！`;
      }
      break;
    }
    case 'enc_beast_egg': {
      if (choiceKey === 'a') {
        for (const b of state.spiritBeasts ?? []) {
          b.awakened = true;
          if (!b.traits.includes('太古雷音')) b.traits.push('太古雷音');
        }
        state.foundationPoints += 2;
        gainedFoundation = 2;
        state.daoyuanAvailable += 15;
        publicLine = `古潭奇蛋化入灵兽园中，全宗数头结契灵兽受其灵韵唤醒，咆哮声震山谷！`;
        systemLine = `【叮！万兽齐醒】全宗灵兽全部觉醒！道统根基 +2、道源 +15！`;
      } else {
        state.inventory.pills.pill_humai_2_supreme = (state.inventory.pills.pill_humai_2_supreme ?? 0) + 2;
        state.inventory.herbs.mat_dew_petals = (state.inventory.herbs.mat_dew_petals ?? 0) + 3;
        state.inventory.materials = state.inventory.materials ?? {};
        state.inventory.materials.mat_chaowen_jade = (state.inventory.materials.mat_chaowen_jade ?? 0) + 2;
        publicLine = `${actor.name} 将潭边残蛋所溢灵液悉数封瓶入库，竟聚成二阶极品护脉丹与玉髓花。`;
        systemLine = `【叮！灵浆入库】极品护脉丹×2、带露玉髓花×3、潮纹玉×2 已入库！`;
      }
      break;
    }
    case 'enc_stele_enlighten':
    default: {
      if (choiceKey === 'a') {
        const ch = applyCultivationDelta(actor, 180);
        actor.manualRatePerRound += 3;
        actor.meridianCapPerRound += 3;
        actor.foundation += 5;
        publicLine = `${actor.name} 于无字古碑前独坐顿悟，吞吐灵光竟瞬增 +${ch.delta} 缕修为！`;
        systemLine = `【叮！古碑顿悟】${actor.name} 修为 +${ch.delta} 缕、吸收率 +3、个人根基 +5！`;
      } else {
        const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
        for (const m of actives) {
          applyCultivationDelta(m, 60);
        }
        state.foundationPoints += 1;
        gainedFoundation = 1;
        publicLine = `${actor.name} 将古碑祖师真意拓印成卷悬于承法藏经阁，全宗 ${actives.length} 位门人齐声精进！`;
        systemLine = `【叮！碑文普惠】全宗活跃门人各 +60 缕修为、道统根基 +1！`;
      }
      break;
    }
  }

  const afterPower = computeMemberPowerScore(actor);
  state.pendingEncounter = null;
  state.resolvedEncounterCount = (state.resolvedEncounterCount ?? 0) + 1;

  state.ledger.push({
    id: `encounter:${commandId}:${enc.id}:${choiceKey}`,
    settlementId: commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: actor.id,
    kind: gainedFoundation > 0 ? 'foundation_gain' : 'cultivation_grant',
    delta: Math.max(1, afterPower - beforePower),
    summary: `奇遇抉择「${enc.title}」→ ${chosenSpec.label}：${systemLine}`,
  });

  const fact = appendFact(state, {
    type: 'heritage.achieved',
    visibility: 'public',
    recipientId: null,
    actorIds: [actor.id],
    publicSummary: publicLine,
    privateSummary: null,
    systemSummary: systemLine,
    details: `${enc.narrative}\n【抉择】${chosenSpec.label}\n【结果】${systemLine}`,
    cueTier: 'major',
  });

  const extraFacts = gainedFoundation > 0 ? checkAndUnlockPermissions(state, fact.id) : [];

  return {
    ok: true,
    message: systemLine,
    factIds: [fact.id, ...extraFacts],
  };
}
