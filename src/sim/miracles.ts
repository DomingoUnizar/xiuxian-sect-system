import { runRealmBreakthrough, isAtRealmPeak } from './breakthrough';
import { applyCultivationDelta } from './cultivation';
import { appendFact, nextEntityId } from './facts';
import { computeMemberPowerScore } from './power';
import type { HostEquipment, Member, MiracleId, WorldState } from './types';

export interface MiracleOutcome {
  ok: boolean;
  message: string;
  factIds: string[];
}

export const MIRACLE_COSTS: Record<MiracleId, number> = {
  empower_peak: 15,
  instant_breakthrough: 20,
  upgrade_root: 22,
  bestow_divine_weapon: 24,
  summon_spirit_tide: 14,
  sect_law_wanjian: 30,
};

export function getDivineWeaponSpecForRealm(realm: Member['realm']): Omit<HostEquipment, 'id'> {
  if (realm === '凡人' || realm === '淬体' || realm === '炼气') {
    return {
      templateId: 'weapon_chaowen_sword',
      name: '赤霄斩蛟剑',
      tier: '凡阶',
      quality: '极品',
      iconPath: 'assets/weapons/sword_t02_006.png',
      durability: 60,
      maxDurability: 60,
      attackBonus: 26,
      defenseBonus: 10,
      specialTrait: 'water_tide',
    };
  }
  if (realm === '筑基') {
    return {
      templateId: 'weapon_chaowen_sword',
      name: '紫电青霜剑',
      tier: '玄阶',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_sword_t02_006.png',
      durability: 90,
      maxDurability: 90,
      attackBonus: 62,
      defenseBonus: 22,
      specialTrait: 'water_tide',
    };
  }
  if (realm === '紫府') {
    return {
      templateId: 'weapon_chaowen_sword',
      name: '太虚镇岳剑',
      tier: '地阶',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
      durability: 120,
      maxDurability: 120,
      attackBonus: 132,
      defenseBonus: 48,
      specialTrait: 'water_tide',
    };
  }
  if (realm === '金丹' || realm === '元婴' || realm === '出窍') {
    return {
      templateId: 'weapon_chaowen_sword',
      name: '九霄斩仙戟',
      tier: '天阶',
      quality: '极品',
      iconPath: 'assets/weapons/ma_tu_polearm_t04_011.png',
      durability: 160,
      maxDurability: 160,
      attackBonus: 270,
      defenseBonus: 102,
      specialTrait: 'water_tide',
    };
  }
  return {
    templateId: 'weapon_chaowen_sword',
    name: '鸿蒙诛仙剑',
    tier: '帝器',
    quality: '极品',
    iconPath: 'assets/weapons/ma_tu_sword_t03_011.png',
    durability: 240,
    maxDurability: 240,
    attackBonus: 680,
    defenseBonus: 260,
    specialTrait: 'water_tide',
  };
}

export function castSystemMiracle(
  state: WorldState,
  params: { commandId: string; miracleId: MiracleId; targetMemberId?: string },
): MiracleOutcome {
  const cost = MIRACLE_COSTS[params.miracleId];
  if (state.daoyuanAvailable < cost) {
    return {
      ok: false,
      message: `可用道源不足（需要 ${cost}，当前可用 ${state.daoyuanAvailable}）。`,
      factIds: [],
    };
  }

  // 全宗群体神迹 1：强降仙霖灵潮
  if (params.miracleId === 'summon_spirit_tide') {
    state.daoyuanAvailable -= cost;
    state.activePhenomenon = {
      id: `phenom_miracle_${state.tick}`,
      kind: 'spirit_tide',
      name: '仙霖灵潮夜涌',
      description: '山门九峰忽降三丈青霖灵潮，众弟子经脉尽数舒张，积伤瞬息愈合！',
      buffLabel: '全宗吐纳 ×1.5 · 突破把握 +15% · 全员清伤补药',
      startedTick: state.tick,
      expiresAtTick: state.tick + 12,
    };

    const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
    for (const m of actives) {
      m.injuries = [];
      m.hp = m.maxHp;
      m.qi = m.maxQi;
      applyCultivationDelta(m, 35);
    }
    state.inventory.herbs.herb_ningling = (state.inventory.herbs.herb_ningling ?? 0) + 4;
    state.inventory.herbs.herb_huiqi = (state.inventory.herbs.herb_huiqi ?? 0) + 4;
    state.inventory.herbs.herb_humai = (state.inventory.herbs.herb_humai ?? 0) + 3;

    state.ledger.push({
      id: `miracle:${params.commandId}:tide`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: 'system',
      kind: 'daoyuan_spend',
      delta: -cost,
      summary: `施展天道神权「强降仙霖灵潮」（耗 ${cost} 道源）：全宗清伤 +35 缕修为并补齐药草`,
    });

    const fact = appendFact(state, {
      type: 'world.phenomenon',
      visibility: 'public',
      recipientId: null,
      actorIds: actives.map((m) => m.id),
      publicSummary: `${state.sectName}天降十二刻仙霖灵潮，山门药圃灵草催熟，在籍弟子旧伤尽消、修为齐增！`,
      privateSummary: null,
      systemSummary: `【叮！发动神权·强降仙霖灵潮】已耗 ${cost} 道源，全宗清伤并各增 +35 缕修为，药库补入凝灵/回气/护脉草！`,
      cueTier: 'major',
    });
    return {
      ok: true,
      message: '仙霖灵潮已降临！全宗旧伤尽愈、各涨 +35 缕修为并补入灵草。',
      factIds: [fact.id],
    };
  }

  // 全宗群体神迹 2：14 点根基解锁「宗门法则 · 万剑归宗」
  if (params.miracleId === 'sect_law_wanjian') {
    if (!state.unlockedPermissions.includes('sect_law')) {
      return {
        ok: false,
        message: '尚未解锁「宗门法则」（需道统根基达到 14 点，当前 ' + state.foundationPoints + ' 点）。',
        factIds: [],
      };
    }

    state.daoyuanAvailable -= cost;
    const actives = state.members.filter((m) => m.status === 'active' && m.binding.bound);
    let totalLayersGained = 0;
    for (const m of actives) {
      m.injuries = [];
      m.hp = m.maxHp;
      m.qi = m.maxQi;
      m.foundation += 4;
      const roundGain = Math.max(10, Math.min(m.caveSupplyPerRound, m.meridianCapPerRound, m.manualRatePerRound));
      const ch = applyCultivationDelta(m, roundGain * 25);
      totalLayersGained += Math.max(0, ch.afterLayer - ch.beforeLayer);
    }
    state.sectReputation += 30;
    state.inventory.spiritStones.high += 2;

    state.ledger.push({
      id: `miracle:${params.commandId}:wanjian`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: 'system',
      kind: 'daoyuan_spend',
      delta: -cost,
      summary: `发动宗门法则「万剑归宗·举宗灌顶」（耗 ${cost} 道源）：全宗同沐 25 轮灌顶，声望 +30`,
    });

    const fact = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: actives.map((m) => m.id),
      publicSummary: `${state.sectName}群峰骤然万剑齐鸣，护山灵脉化作漫天金莲垂落！全宗 ${actives.length} 位门人百脉齐通，共破 ${Math.max(1, totalLayersGained)} 重小关！`,
      privateSummary: null,
      systemSummary: `【叮！发动宗门法则·万剑归宗】耗 ${cost} 道源，全宗 ${actives.length} 人同享二十五轮大道灌顶（共破 ${totalLayersGained} 小关），声望 +30、上品灵石 +2！`,
      details: [
        `一式引剑：${state.sectName}七大峰巅剑意共鸣，金莲灵雨倾泻千丈。`,
        `二式通脉：${actives.map((m) => m.name).join('、')} 齐声合脉，二十五轮灵气瞬息吞纳。`,
        `三式立威：阖派根基俱增，护山威名震动修真界，上品灵石再添二枚。`,
      ].join('\n'),
      cueTier: 'major',
    });
    return {
      ok: true,
      message: `👑 万剑归宗发动成功！全宗 ${actives.length} 人同沐二十五轮大道灌顶！`,
      factIds: [fact.id],
    };
  }

  // 以下为单体开挂神迹，须指定活跃已绑定宿主
  const member = state.members.find(
    (m) => m.id === params.targetMemberId && m.status === 'active' && m.binding.bound,
  );
  if (!member) {
    return { ok: false, message: '请先在右侧点选一位在籍活跃宿主再施展天道神权。', factIds: [] };
  }

  // 1. ⚡ 醍醐灌顶：直冲九层圆满
  if (params.miracleId === 'empower_peak') {
    if (isAtRealmPeak(member)) {
      return {
        ok: false,
        message: `${member.name} 已处于${member.realm}九层圆满，请直接点击「🌟 立地破境」！`,
        factIds: [],
      };
    }

    state.daoyuanAvailable -= cost;
    const beforePower = computeMemberPowerScore(member);
    const beforeRealmLabel = `${member.realm}${member.realmLayer}层`;
    while (member.realmLayer < 9) {
      member.realmLayer += 1;
      member.cultivationCap += 35;
      member.maxHp += 10;
      member.maxQi += 8;
    }
    member.cultivation = member.cultivationCap;
    member.hp = member.maxHp;
    member.qi = member.maxQi;
    member.pillToxicity = 0;
    member.injuries = [];
    member.foundation += 2;
    member.notes.push(`第 ${state.tick} 刻获灵气灌顶直达${member.realm}九层圆满`);
    const afterPower = computeMemberPowerScore(member);

    state.ledger.push({
      id: `miracle:${params.commandId}:empower`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: member.id,
      kind: 'cultivation_grant',
      delta: member.cultivationCap,
      summary: `天道神权「醍醐灌顶」：${member.name} 由${beforeRealmLabel}直冲${member.realm}九层圆满（战力 ${beforePower} → ${afterPower}）`,
    });

    const fact = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'host_private',
      recipientId: member.id,
      actorIds: [member.id],
      publicSummary: null,
      privateSummary: `【叮！天道醍醐灌顶】磅礴大道灵泉轰然贯入紫府，你的修为已连破小关直达${member.realm}九层圆满（战力 ${beforePower} → ${afterPower}），随时可引气破大境！`,
      systemSummary: `【叮！醍醐灌顶】已耗 ${cost} 道源将 ${member.name} 直推至${member.realm}九层圆满（战力 ${beforePower} → ${afterPower}）。`,
      cueTier: 'major',
    });

    // 同刻写一条符合单盲隔离的公开奇景纪事
    const pubFact = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [member.id],
      publicSummary: `${member.name} 于静室参悟之际灵台陡然清朗，丹田灵漩狂涌连破数阶，一举修至${member.realm}九层圆满之境！`,
      privateSummary: null,
      systemSummary: `${member.name} 圆满异象已在山门传开。`,
      cueTier: 'silent',
    });

    return {
      ok: true,
      message: `⚡ 醍醐灌顶成功！${member.name} 已直达${member.realm}九层圆满（战力 ${afterPower}）！`,
      factIds: [fact.id, pubFact.id],
    };
  }

  // 2. 🌟 立地破境：九层圆满 100% 必破大境
  if (params.miracleId === 'instant_breakthrough') {
    if (!isAtRealmPeak(member)) {
      return {
        ok: false,
        message: `${member.name} 尚未至九层圆满，请先施展「⚡ 醍醐灌顶」推至圆满。`,
        factIds: [],
      };
    }

    state.daoyuanAvailable -= cost;
    member.currentActivity = null;
    member.injuries = [];
    member.hp = member.maxHp;
    const bt = runRealmBreakthrough(state, member, undefined, { guaranteedByMiracle: true });

    state.ledger.push({
      id: `miracle:${params.commandId}:breakthrough`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: member.id,
      kind: 'cultivation_grant',
      delta: 1,
      summary: `天道神权「立地破境」：护持 ${member.name} 稳破大境晋入「${bt.newRealm}1层」（耗 ${cost} 道源）`,
    });

    return {
      ok: true,
      message: `🌟 立地破境大成！${member.name} 已正式跨入「${bt.newRealm}1层」！`,
      factIds: bt.factId ? [bt.factId] : [],
    };
  }

  // 3. 🧬 逆天洗髓：灵根升品 (凡品 -> 地品 -> 天品)
  if (params.miracleId === 'upgrade_root') {
    if (member.spiritRoot.grade === '天品') {
      return {
        ok: false,
        message: `${member.name} 已是至高「天品」仙根，无须再洗髓升品！`,
        factIds: [],
      };
    }

    state.daoyuanAvailable -= cost;
    const oldGrade = member.spiritRoot.grade;
    const newGrade = oldGrade === '凡品' ? '地品' : '天品';
    const beforePower = computeMemberPowerScore(member);

    member.spiritRoot.grade = newGrade;
    member.caveSupplyPerRound += 4;
    member.meridianCapPerRound += 4;
    member.manualRatePerRound += 3;
    member.aptitude.comprehension = Math.min(99, member.aptitude.comprehension + 15);
    member.aptitude.bone = Math.min(99, member.aptitude.bone + 15);
    member.aptitude.soul = Math.min(99, member.aptitude.soul + 10);
    member.foundation += 6;
    member.maxHp += 40;
    member.hp = member.maxHp;
    member.maxQi += 30;
    member.qi = member.maxQi;
    member.pillToxicity = 0;
    member.injuries = [];
    member.notes.push(`第 ${state.tick} 刻灵脉洗髓蜕变，灵根由${oldGrade}升入${newGrade}`);

    const afterPower = computeMemberPowerScore(member);

    state.ledger.push({
      id: `miracle:${params.commandId}:root`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: member.id,
      kind: 'ability_grant',
      delta: 1,
      summary: `逆天洗髓：${member.name} 灵根 ${oldGrade} → ${newGrade}（战力 ${beforePower} → ${afterPower}）`,
    });

    const privFact = appendFact(state, {
      type: 'ability.granted',
      visibility: 'host_private',
      recipientId: member.id,
      actorIds: [member.id],
      publicSummary: null,
      privateSummary: `【叮！逆天洗髓功成】玄黄仙髓洗净百骸凡尘，你的${member.spiritRoot.elements.join('')}灵根正式由「${oldGrade}」升格为「${newGrade}」！吸收率与战力飙升（${beforePower} → ${afterPower}）。`,
      systemSummary: `【叮！逆天洗髓】${member.name} 灵根晋入「${newGrade}」（战力 ${beforePower} → ${afterPower}），根骨悟性暴涨。`,
      cueTier: 'major',
    });
    const pubFact = appendFact(state, {
      type: 'cultivation.progressed',
      visibility: 'public',
      recipientId: null,
      actorIds: [member.id],
      publicSummary: `${member.name} 静坐之际忽有清霞贯体、筋骨齐鸣，浊质尽褪犹如脱胎换骨，举手投足灵韵倍增！`,
      privateSummary: null,
      systemSummary: `${member.name} 洗髓异象引发同门赞叹。`,
      cueTier: 'silent',
    });

    return {
      ok: true,
      message: `🧬 逆天洗髓大成！${member.name} 灵根晋升为「${newGrade}」（战力 ${beforePower} → ${afterPower}）！`,
      factIds: [privFact.id, pubFact.id],
    };
  }

  // 4. 🗡️ 天道赐器：按当前境界直赐高阶神兵并当场认主
  if (params.miracleId === 'bestow_divine_weapon') {
    const spec = getDivineWeaponSpecForRealm(member.realm);
    if (member.equippedWeapon && member.equippedWeapon.attackBonus >= spec.attackBonus) {
      return {
        ok: false,
        message: `${member.name} 已佩「${member.equippedWeapon.name}」，不弱于${member.realm}境可赐神兵；先助其破入更高大境即可赐下更高阶神兵！`,
        factIds: [],
      };
    }

    state.daoyuanAvailable -= cost;
    const beforePower = computeMemberPowerScore(member);
    if (member.equippedWeapon) {
      state.inventory.weapons.push(member.equippedWeapon);
    }
    const newWeapon: HostEquipment = {
      ...spec,
      id: nextEntityId(state, 'wpn'),
    };
    member.equippedWeapon = newWeapon;
    const afterPower = computeMemberPowerScore(member);

    state.ledger.push({
      id: `miracle:${params.commandId}:weapon`,
      settlementId: params.commandId,
      effectIndex: 0,
      tick: state.tick,
      recipientId: member.id,
      kind: 'item_transfer',
      delta: 1,
      itemTemplateId: newWeapon.templateId,
      summary: `天道赐器：将${newWeapon.tier}${newWeapon.quality}「${newWeapon.name}」赐与 ${member.name}（战力 ${beforePower} → ${afterPower}）`,
    });

    const fact = appendFact(state, {
      type: 'forging.finished',
      visibility: 'host_private',
      recipientId: member.id,
      actorIds: [member.id],
      publicSummary: null,
      privateSummary: `【叮！天道神兵认主】寒芒破空而至！${newWeapon.tier}${newWeapon.quality}「${newWeapon.name}」（攻 +${newWeapon.attackBonus}）已化作本命伴器收入掌中（战力 ${beforePower} → ${afterPower}）。`,
      systemSummary: `【叮！天道赐器】已耗 ${cost} 道源将「${newWeapon.name}」直接佩至 ${member.name} 掌中（战力 ${beforePower} → ${afterPower}）。`,
      details: `一式降锋：道源凝聚仙光化作「${newWeapon.name}」悬于掌心。\n二式认主：锋芒鸣啸契合 ${member.name} 真元（攻 +${newWeapon.attackBonus} / 防 +${newWeapon.defenseBonus}），旧器已自动收回百宝阁。`,
      cueTier: 'major',
    });

    return {
      ok: true,
      message: `🗡️ 神兵认主！${member.name} 已佩「${newWeapon.name}」（战力 ${beforePower} → ${afterPower}）！`,
      factIds: [fact.id],
    };
  }

  return { ok: false, message: '未知神权指令。', factIds: [] };
}
