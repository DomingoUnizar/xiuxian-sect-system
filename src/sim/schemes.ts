import { isAtRealmPeak, runRealmBreakthrough } from './breakthrough';
import { applyCultivationDelta } from './cultivation';
import { awardSystemXp } from './destinyTraits';
import { appendDramaScene, appendFact, nextEntityId } from './facts';
import { checkAndUnlockPermissions } from './heritage';
import { computeMemberPowerScore, getCultivationPerRound } from './power';
import { createStreamRng } from './prng';
import type { Member, PendingClutchCrisis, SchemeKind, WorldState } from './types';

export interface MemberObsession {
  tag: string;
  tone: 'urgent' | 'gold' | 'jade' | 'violet';
  monologue: string;
}

export const SCHEME_COOLDOWN_TICKS = 3;

export const SCHEME_COSTS: Record<SchemeKind, number> = {
  nurture: 5,
  tiger_wolf: 6,
  dual_rivalry: 8,
};

export function getEffectiveSchemeCost(
  state: Pick<WorldState, 'activePerks'>,
  schemeKind: SchemeKind,
): number {
  const base = SCHEME_COSTS[schemeKind];
  if (schemeKind === 'dual_rivalry' && state.activePerks?.includes('perk_gu_involution')) {
    return Math.max(4, base - 3);
  }
  return base;
}

export function pickBestRivalOrPartner(
  state: Pick<WorldState, 'members'>,
  member: Member,
): Member | null {
  const peers = state.members.filter(
    (m) => m.id !== member.id && m.status === 'active' && m.binding.bound,
  );
  if (peers.length === 0) return null;
  const myPower = computeMemberPowerScore(member);
  return [...peers].sort(
    (a, b) =>
      Math.abs(computeMemberPowerScore(a) - myPower) -
      Math.abs(computeMemberPowerScore(b) - myPower),
  )[0];
}

export function deriveMemberObsession(
  state: Pick<WorldState, 'members' | 'sectCrisis' | 'tick'>,
  member: Member,
): MemberObsession {
  if (member.injuries.length > 0) {
    return {
      tag: '带伤不甘',
      tone: 'urgent',
      monologue: `筋脉里这道「${member.injuries[0]}」隐隐作痛，可我若今日停下，拿什么替山门撑腰！`,
    };
  }
  if (isAtRealmPeak(member)) {
    return {
      tag: '临门一脚',
      tone: 'gold',
      monologue: `已摸到${member.realm}九层圆满壁垒！只要再来一把狠火或者前辈一句话，今夜就能当场冲关！`,
    };
  }
  const rival = member.bonds?.[0];
  if (rival) {
    return {
      tag: '暗中较劲',
      tone: 'violet',
      monologue: `${rival.targetName}那家伙昨日练剑比我还多出三十息，下次切磋我必赢他半招不可！`,
    };
  }
  if (member.role === 'sect_master') {
    const daysLeft = Math.max(
      1,
      Math.ceil(((state.sectCrisis?.deadlineTick ?? 360) - state.tick) / 12),
    );
    return {
      tag: '守山死志',
      tone: 'urgent',
      monologue: `距强敌登门只剩 ${daysLeft} 日，哪怕豁出老骨头，也得给门下这帮小子争出一条生路！`,
    };
  }
  if (member.personality === '好战') {
    return {
      tag: '剑心痒极',
      tone: 'gold',
      monologue: '光在洞府干坐有什么意思！演武台和山外强敌，才是磨出真锋芒的地方！',
    };
  }
  if (member.hasAlchemyFire) {
    return {
      tag: '痴迷丹火',
      tone: 'jade',
      monologue: '这尊凡炉火候还差半息稳住，再让我试炼一炉，必定能炼出叫全宗眼红的好丹！',
    };
  }
  return {
    tag: '苦修求变',
    tone: 'jade',
    monologue: member.personalGoal || '旁人都说我资质寻常，偏要趁无人注意多苦修几轮给他们看！',
  };
}

const NURTURE_FLAVORS = [
  {
    beat: (n: string) => `你趁 ${n} 吐纳打盹之际，往茶盏里融了一缕温脉灵雾。`,
    delusion: (n: string) => `${n} 独坐蒲团热泪盈眶：「连我哪根经脉隐隐发紧都被前辈猜透，此生誓死不负山门！」`,
    shock: '早课执事惊呼：「昨夜还愁眉紧锁的小子，今日怎的出招竟带破空声了？」',
  },
  {
    beat: (n: string) => `你在 ${n} 必经石阶刻下三笔看似寻常的剑痕，正合他当下缺口。`,
    delusion: (n: string) => `${n} 盯着石阶倒吸冷气：「三道划痕暗合七重变招！神秘老祖随手点化竟玄妙至此！」`,
    shock: '洒扫杂役揉着眼睛嘀咕：「那块破石阶怎么看久了让人头晕，这位师兄竟蹲着傻笑了半个时辰？」',
  },
  {
    beat: (n: string) => `夜风吹翻经卷恰好停在行气要诀那一页，灵力顺势替 ${n} 捋顺淤塞。`,
    delusion: (n: string) => `${n} 合书拜了三拜：「风吹书页哪有这等巧合？定是那位高人在暗中替我护法！」`,
    shock: '藏经阁长老叹奇：「平时木讷的弟子今早突然一通百通，莫非真的开了窍？」',
  },
  {
    beat: (n: string) => `你不动声色引来山风洗去 ${n} 浑身旧创躁气，真元如水归渠。`,
    delusion: (n: string) => `${n} 握紧双拳暗喜：「前辈连我旧伤何处发凉都算得清清楚楚，这大腿我抱定了！」`,
    shock: '同院师弟看傻了眼：「昨儿还裹着绷带呢，今天生龙活虎差点把木桩劈成两半！」',
  },
  {
    beat: (n: string) => `一缕极淡的金光悄悄落入 ${n} 丹田，将平日卡壳的关窍一击推开。`,
    delusion: (n: string) => `${n} 仰望房梁深鞠一躬：「多谢前辈再造之恩，徒儿定当拿头去撞大宗天骄！」`,
    shock: '丹房师弟纳闷：「隔壁屋里传出一股清雅药香，可刚才明明没生火啊？」',
  },
];

const TIGER_FLAVORS = [
  {
    delusion: (n: string) => `${n} 浑身冒着白气仰天狂笑：「痛快！前辈传我的虎狼法门专克懦夫，越险越长真本事！」`,
    shock: '邻院弟子半夜被灵气轰鸣震醒，跑出来只见一道剑光斜劈开院外青石！',
  },
  {
    delusion: (n: string) => `${n} 死死攥紧发烫玉简：「拿命赌出来的修为才是真家伙！前辈信我扛得住这份霸道造化！」`,
    shock: '山脚守夜弟子心惊：「刚才后山灵压陡然炸开，还以为哪位长老在私下试斩！」',
  },
  {
    delusion: (n: string) => `${n} 舔了舔嘴唇眼放精光：「区区经脉胀痛算什么？下次前辈还有更猛的绝招只管塞给我！」`,
    shock: '宗门器堂弟子看着裂了一道口子的试剑石，半天合不拢嘴！',
  },
];

const RIVALRY_FLAVORS = [
  {
    beat1: (a: string, b: string) => `你左耳对 ${a} 吹风：「今日赢下 ${b}，独赐护脉剑心得！」`,
    beat2: (a: string, b: string) => `转身右耳对 ${b} 密令：「喂招压住七成火候，务必逼出 ${a} 的全部极限！」`,
    delusion: (a: string, b: string) => `${a} 心想「前辈果然单传偏爱我！」；对面 ${b} 暗笑「前辈独独信我这陪练大将！」`,
    shock: '台下外门弟子看得直揉眼睛：「这两位平时见面点个头而已，今天怎么打得像抢亲传大位？」',
  },
  {
    beat1: (a: string, b: string) => `你悄悄传音 ${a}：「听说 ${b} 昨夜偷学了一招快剑，就等你去踢场子！」`,
    beat2: (a: string, b: string) => `转头又撩拨 ${b}：「${a} 放出话来十合之内必赢你，可别丢了我的脸！」`,
    delusion: (a: string, b: string) => `${a} 越打越上头「果然只有同门强者能逼我突破！」；${b} 暗骂「好小子藏得真深，多亏前辈通风报信！」`,
    shock: '路过长老摸着胡须直点头：「这帮年轻崽子好胜心起来了，连晚饭都不吃还在加练！」',
  },
  {
    beat1: (a: string, b: string) => `你假装失手把同一份剑谱残页分别塞进 ${a} 与 ${b} 的门缝里。`,
    beat2: (a: string, b: string) => `二人各以为独得绝学，偏巧同时上试剑台验招，一照面全使出同一路起手式！`,
    delusion: (a: string, b: string) => `${a} 震惊：「他怎么也会半式？莫非老祖在考验我们谁悟得更透！」；${b} 当场发狠加力！`,
    shock: '外门弟子看呆了：「双剑合鸣居然劈出三丈剑风？这两人莫非暗中结了双修剑阵？」',
  },
];

export function executeSystemScheme(
  state: WorldState,
  params: { commandId: string; memberId: string; schemeKind: SchemeKind },
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find(
    (m) => m.id === params.memberId && m.status === 'active' && m.binding.bound,
  );
  if (!member) {
    return { ok: false, message: '请先点选一位在籍活跃弟子再下私令。', factIds: [] };
  }
  if (state.pendingClutch || state.activeDuel?.status === 'fighting') {
    return { ok: false, message: '请先了结眼前交锋或危机，再谋划下一道私令。', factIds: [] };
  }

  const cdUntil = member.schemeCooldowns?.[params.schemeKind] ?? 0;
  if (cdUntil > state.tick) {
    return {
      ok: false,
      message: `${member.name} 正消化上道私令余韵，还需推进 ${cdUntil - state.tick} 刻方可再用此招。`,
      factIds: [],
    };
  }

  const cost = getEffectiveSchemeCost(state, params.schemeKind);
  if (state.daoyuanAvailable < cost) {
    return {
      ok: false,
      message: `可用道源不足（需要 ${cost} 点，当前仅余 ${state.daoyuanAvailable} 点）。`,
      factIds: [],
    };
  }

  const traits = new Set(member.destinyTraits ?? []);
  const perks = new Set(state.activePerks ?? []);
  const cultMult =
    (traits.has('trait_reincarnate') ? 1.35 : 1) *
    (perks.has('perk_epiphany_halo') ? 1.35 : 1);

  let rebateDaoyuan = 0;
  if (traits.has('trait_luck_son')) rebateDaoyuan += 3;
  if (perks.has('perk_daoyuan_rebate')) rebateDaoyuan += 2;
  const rebateText = rebateDaoyuan > 0 ? `（触发气运/回扣返还 +${rebateDaoyuan} 源）` : '';

  const stampCooldown = () => {
    member.schemeCooldowns ??= {};
    member.schemeCooldowns[params.schemeKind] = state.tick + SCHEME_COOLDOWN_TICKS;
  };

  // 1. 🌱 雪中送炭
  if (params.schemeKind === 'nurture') {
    state.daoyuanAvailable = state.daoyuanAvailable - cost + rebateDaoyuan;
    stampCooldown();
    const beforePower = computeMemberPowerScore(member);
    member.injuries = [];
    member.hp = member.maxHp;
    member.qi = member.maxQi;
    member.aptitude.comprehension = Math.min(99, member.aptitude.comprehension + 3);
    member.aptitude.mindset = Math.min(99, member.aptitude.mindset + (traits.has('trait_sweet_talker') ? 8 : 3));

    let extraBonus = traits.has('trait_sweet_talker') ? 50 : 0;
    let traitNote = traits.has('trait_sweet_talker') ? ' · 「嘴甜讨喜」加赠+50缕' : '';
    if (traits.has('trait_pill_savant')) {
      state.inventory.pills.pill_humai_2_mid = (state.inventory.pills.pill_humai_2_mid ?? 0) + 1;
      traitNote += ' · 「丹火通明」顺炉结成护脉丹×1';
    }

    let resultLine = '';
    if (isAtRealmPeak(member)) {
      member.foundation += 3;
      const bt = runRealmBreakthrough(state, member, undefined, { guaranteedByMiracle: true });
      resultLine = bt.succeeded
        ? `顺水推舟一举叩开「${bt.newRealm}1层」`
        : '根基厚积三点并补满气血';
    } else {
      const baseGain = Math.max(96, getCultivationPerRound(member) * 12) + extraBonus;
      const ch = applyCultivationDelta(member, Math.round(baseGain * cultMult));
      resultLine = `连修十二轮实涨 +${ch.delta} 缕`;
    }
    const afterPower = computeMemberPowerScore(member);
    awardSystemXp(state, 30);

    state.ledger.push({
      id: `scheme:${params.commandId}:nurture`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: member.id,
      kind: 'cultivation_grant',
      delta: afterPower - beforePower,
      summary: `幕后私令「雪中送炭」：${member.name}${resultLine}（战力 ${beforePower} → ${afterPower}）${traitNote}${rebateText}`,
    });

    const flav = NURTURE_FLAVORS[(state.tick + state.nextFactSeq) % NURTURE_FLAVORS.length];
    const f = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [member.id],
      publicSummary: `${member.name} 夜半独悟关窍，伤势尽去、气息暴涨（战力 ${beforePower} 升至 ${afterPower}）！`,
      privateSummary: null,
      systemSummary: `【叮！私令兑现·雪中送炭】${member.name}${resultLine}，战力 ${beforePower} → ${afterPower}。${traitNote}${rebateText}`,
      cueTier: 'notable',
    });

    appendDramaScene(state, {
      title: `${member.name} · 雪中送炭`,
      badge: '精准点拨',
      tone: 'scheme',
      actorId: member.id,
      actorName: member.name,
      portraitId: member.portraitId,
      beats: [
        flav.beat(member.name),
        `${member.name}${resultLine}，战力从 ${beforePower} 稳稳蹿升到 ${afterPower}！${traitNote}`,
      ],
      systemTruth: `实耗 ${cost - rebateDaoyuan} 道源对症下药，既清掉旧伤心障，又顺手攒入 +30 系统算力。${rebateText}`,
      hostDelusion: flav.delusion(member.name),
      publicShock: flav.shock,
    });

    return {
      ok: true,
      message: `雪中送炭见效！${member.name}${resultLine}（战力 ${beforePower} → ${afterPower}）${rebateText}`,
      factIds: [f.id],
    };
  }

  // 2. 🔥 虎狼猛药
  if (params.schemeKind === 'tiger_wolf') {
    state.daoyuanAvailable = state.daoyuanAvailable - cost + rebateDaoyuan;
    stampCooldown();
    const beforePower = computeMemberPowerScore(member);
    const rng = createStreamRng(state.seed, 'scheme', `${member.id}:tiger`, state.tick);
    const successChance = Math.min(82, 50 + Math.floor((member.aptitude.mindset + member.aptitude.bone) / 5));
    const roll = rng.nextInt(1, 100);
    const flav = TIGER_FLAVORS[(state.tick + state.nextFactSeq) % TIGER_FLAVORS.length];

    if (roll <= successChance) {
      const gain = Math.round(Math.max(144, getCultivationPerRound(member) * 18) * cultMult);
      const ch = applyCultivationDelta(member, gain);
      member.aptitude.bone = Math.min(99, member.aptitude.bone + 6);
      member.foundation += 3;
      let learnedMethodName = '';
      if (!member.knownMethods.includes('method_qinglian_huifeng')) {
        member.knownMethods.push('method_qinglian_huifeng');
        learnedMethodName = '《青莲回锋诀》';
      } else if (!member.knownMethods.includes('method_jinglei_jue')) {
        member.knownMethods.push('method_jinglei_jue');
        learnedMethodName = '《惊雷破邪诀》';
      }
      const afterPower = computeMemberPowerScore(member);
      awardSystemXp(state, 35);

      state.ledger.push({
        id: `scheme:${params.commandId}:tiger`,
        settlementId: params.commandId,
        effectIndex: 0,
        tick: state.tick,
        recipientId: member.id,
        kind: 'cultivation_grant',
        delta: ch.delta,
        summary: `幕后私令「虎狼猛药」：${member.name} 暴涨 +${ch.delta} 缕修为${learnedMethodName ? `并悟出${learnedMethodName}` : ''}`,
      });

      const f = appendFact(state, {
        type: 'cultivation.progressed',
        visibility: 'public',
        recipientId: null,
        actorIds: [member.id],
        publicSummary: `${member.name} 闭关狠练高阶行气路数，一口气冲开数重关窍，修为暴涨 +${ch.delta} 缕、战力直冲 ${afterPower}！`,
        privateSummary: null,
        systemSummary: `【叮！虎狼猛药赌赢】${member.name} 扛住暴走灵潮，修为 +${ch.delta} 缕（战力 ${beforePower} → ${afterPower}）！${rebateText}`,
        cueTier: 'major',
      });

      appendDramaScene(state, {
        title: `${member.name} · 虎狼大捷`,
        badge: '险中爆种',
        tone: 'scheme',
        actorId: member.id,
        actorName: member.name,
        portraitId: member.portraitId,
        beats: [
          `你故意塞去一份猛烈至极的行气险方，灵气当即在 ${member.name} 体内翻江倒海！`,
          `${member.name} 死死咬牙压住经脉震颤，修为暴涨 +${ch.delta} 缕${learnedMethodName ? `并顺势悟出${learnedMethodName}` : ''}！`,
        ],
        systemTruth: `只砸 ${cost - rebateDaoyuan} 道源赌赢大暴走，${member.name} 战力直冲 ${afterPower}，并进账 +35 系统算力。${rebateText}`,
        hostDelusion: flav.delusion(member.name),
        publicShock: flav.shock,
      });

      return {
        ok: true,
        message: `虎狼猛药赌赢！${member.name} 修为暴涨 +${ch.delta} 缕（战力 ${beforePower} → ${afterPower}）`,
        factIds: [f.id],
      };
    }

    member.hp = Math.max(10, Math.floor(member.maxHp * 0.2));
    awardSystemXp(state, 20);
    const clutch: PendingClutchCrisis = {
      id: nextEntityId(state, 'clutch'),
      kind: 'tiger_backlash',
      title: `${member.name} · 虎狼猛药走火危机`,
      actorId: member.id,
      actorName: member.name,
      actorPortraitId: member.portraitId,
      beats: [
        `第1息：${member.name} 照着你私下塞来的险方强催灵力，经脉壁障咔嚓裂开数道细纹！`,
        `第2息：狂暴灵气倒灌回丹田，气血跌至 ${member.hp}/${member.maxHp}！若无人拉一把，今夜非重伤躺倒不可！`,
      ],
      crisisPrompt: `这把虎狼药火候太猛，${member.name} 马上要走火入魔！是掏道源强保他化煞成龙，还是省下道源让他自己扛？`,
      futureCost: 12,
      aegisCost: 9,
      spawnedAtTick: state.tick,
    };
    state.pendingClutch = clutch;

    const f = appendFact(state, {
      type: 'system.advanced',
      visibility: 'system_only',
      recipientId: member.id,
      actorIds: [member.id],
      publicSummary: null,
      privateSummary: null,
      systemSummary: `【绝境警报】${member.name} 吞下虎狼猛药真元暴走，等待你立刻拍板是否救场！`,
      cueTier: 'notable',
    });

    return {
      ok: true,
      message: `${member.name} 吞下猛药真元暴走！请在定格弹窗拍板是否抢救！`,
      factIds: [f.id],
    };
  }

  // 3. 🎭 双头拱火
  const partner = pickBestRivalOrPartner(state, member);
  if (!partner) {
    return { ok: false, message: '山门需至少有两名在籍活跃门人方能两头拱火。', factIds: [] };
  }

  state.daoyuanAvailable = state.daoyuanAvailable - cost + rebateDaoyuan;
  stampCooldown();
  const beforeA = computeMemberPowerScore(member);
  const beforeB = computeMemberPowerScore(partner);

  const invBonusA = traits.has('trait_involution') ? 60 : 0;
  const invBonusB = partner.destinyTraits?.includes('trait_involution') ? 60 : 0;
  const chA = applyCultivationDelta(member, Math.round((Math.max(96, getCultivationPerRound(member) * 12) + invBonusA) * cultMult));
  const chB = applyCultivationDelta(partner, Math.round((Math.max(80, getCultivationPerRound(partner) * 10) + invBonusB) * cultMult));
  member.aptitude.mindset = Math.min(99, member.aptitude.mindset + 4);
  partner.aptitude.mindset = Math.min(99, partner.aptitude.mindset + 4);

  const bondGainA = traits.has('trait_involution') ? 18 : 12;
  const bondGainB = partner.destinyTraits?.includes('trait_involution') ? 18 : 12;
  member.bonds ??= [];
  partner.bonds ??= [];
  const existA = member.bonds.find((b) => b.targetId === partner.id);
  if (existA) {
    existA.powerBonus = Math.min(24, existA.powerBonus + 6);
  } else {
    member.bonds.push({
      targetId: partner.id,
      targetName: partner.name,
      kind: 'rivalry',
      label: `切磋死磕·${partner.name}`,
      powerBonus: bondGainA,
    });
  }
  const existB = partner.bonds.find((b) => b.targetId === member.id);
  if (existB) {
    existB.powerBonus = Math.min(24, existB.powerBonus + 6);
  } else {
    partner.bonds.push({
      targetId: member.id,
      targetName: member.name,
      kind: 'rivalry',
      label: `暗中较劲·${member.name}`,
      powerBonus: bondGainB,
    });
  }

  const pairIds = [member.id, partner.id].sort();
  const pairKey = `rivalry:${pairIds[0]}:${pairIds[1]}`;
  const rivalryHeritageCount = state.heritages.filter((h) => h.key.startsWith('rivalry:')).length;
  let gainedFoundation = 0;
  if (!state.heritages.some((h) => h.key === pairKey) && rivalryHeritageCount < 3) {
    gainedFoundation = 1;
    state.foundationPoints += 1;
    checkAndUnlockPermissions(state);
    state.heritages.push({
      key: pairKey,
      methodId: 'rivalry_spar',
      methodName: `${member.name}×${partner.name}双星拱火`,
      founderId: member.id,
      successorId: partner.id,
      achievedAtTick: state.tick,
      foundationAwarded: 1,
      daoyuanAwarded: 0,
      factId: '',
    });
  }

  const afterA = computeMemberPowerScore(member);
  const afterB = computeMemberPowerScore(partner);
  awardSystemXp(state, 35);

  state.ledger.push({
    id: `scheme:${params.commandId}:rivalry`,
    settlementId: params.commandId,
    effectIndex: 0,
    tick: state.tick,
    recipientId: member.id,
    kind: 'cultivation_grant',
    delta: chA.delta,
    summary: `双头拱火：挑动 ${member.name} 与 ${partner.name} 互相较劲（双方各得切磋羁绊，战力齐飙）`,
  });

  const fact = appendFact(state, {
    type: 'battle.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id, partner.id],
    publicSummary: `${member.name} 与 ${partner.name} 无端在演武台对轰十八合，互相硬逼出一身真劲！${member.name} 战力跃至 ${afterA}，${partner.name} 升至 ${afterB}！`,
    privateSummary: null,
    systemSummary: `【叮！双头拱火名场面】一石二鸟！${member.name}(+${chA.delta}缕, 战力${beforeA}→${afterA}) 与 ${partner.name}(+${chB.delta}缕, 战力${beforeB}→${afterB}) 各自偷乐${
      gainedFoundation > 0 ? '，宗门顺势积下 +1 点根基' : ''
    }！${rebateText}`,
    cueTier: 'major',
  });

  const rf = RIVALRY_FLAVORS[(state.tick + state.nextFactSeq) % RIVALRY_FLAVORS.length];
  appendDramaScene(state, {
    title: `${member.name} × ${partner.name} · 双头拱火`,
    badge: '两头瞒天拱火',
    tone: 'rivalry',
    actorId: member.id,
    actorName: `${member.name} & ${partner.name}`,
    portraitId: member.portraitId,
    beats: [
      rf.beat1(member.name, partner.name),
      rf.beat2(member.name, partner.name),
      `二人台上面红耳赤对砍十八合，打完各自摸着发热的护腕暗喜，谁也没敢开口拆穿！`,
    ],
    systemTruth: `实耗 ${cost - rebateDaoyuan} 道源同时喂饱两个人并获 +35 算力，互相缔结「死磕羁绊」（常驻战力 +${bondGainA}/+${bondGainB}）${
      gainedFoundation > 0 ? '，还白嫖 +1 点道统根基' : ''
    }！${rebateText}`,
    hostDelusion: rf.delusion(member.name, partner.name),
    publicShock: rf.shock,
  });

  return {
    ok: true,
    message: `双头拱火大成！${member.name}(${beforeA}→${afterA}) 与 ${partner.name}(${beforeB}→${afterB}) 缔结切磋羁绊！`,
    factIds: [fact.id],
  };
}
