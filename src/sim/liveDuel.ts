import { applyCultivationDelta } from './cultivation';
import {
  applyCrisisDefeat,
  applyCrisisVictory,
  createInitialSectCrisis,
  getCurrentCrisisSpec,
  pickStrongestChampion,
} from './crisis';
import { awardSystemXp, getTraitSpec, resolveEntityTraits } from './destinyTraits';
import { appendDramaScene, appendFact, nextEntityId } from './facts';
import { checkAndUnlockPermissions } from './heritage';
import { computeMemberPowerScore } from './power';
import { createStreamRng } from './prng';
import type {
  ActiveDuelState,
  BattleTurn,
  DestinyTraitId,
  DuelCheatKind,
  DuelKind,
  Member,
  WorldState,
} from './types';

function resolveActorCombatStats(
  state: WorldState,
  member: Member,
): {
  traits: DestinyTraitId[];
  maxHp: number;
  shield: number;
  attack: number;
  defense: number;
} {
  const traits =
    member.destinyTraits && member.destinyTraits.length > 0
      ? member.destinyTraits
      : resolveEntityTraits(state.seed, member.id, member.spiritRoot.grade);
  const perks = new Set(state.activePerks ?? []);
  const power = computeMemberPowerScore(member);

  let maxHp = Math.max(120, Math.round(power * 1.15));
  let shield = 0;
  let weaponBonus = member.equippedWeapon ? Math.round(member.equippedWeapon.attackBonus * 0.65) : 0;
  if (traits.includes('trait_forge_soul')) {
    weaponBonus *= 2;
  }
  const bondCount = member.bonds?.length ?? 0;
  let attack = Math.max(18, Math.round(power * 0.165) + weaponBonus + (bondCount > 0 ? 4 : 0));
  let defense = Math.max(
    4,
    Math.round(power * 0.045) + (member.equippedWeapon ? Math.round(member.equippedWeapon.defenseBonus * 0.6) : 0),
  );

  if (traits.includes('trait_iron_bone')) {
    shield = Math.round(maxHp * 0.25);
  }
  if (perks.has('perk_gu_involution') && bondCount > 0) {
    attack = Math.round(attack * (1 + bondCount * 0.1));
  }
  if (perks.has('perk_mortal_rise') && member.spiritRoot.grade === '凡品') {
    attack = Math.round(attack * 1.25);
    defense = Math.round(defense * 1.25);
  }

  return { traits, maxHp, shield, attack, defense };
}

export function startLiveDuel(
  state: WorldState,
  params: { commandId: string; kind: DuelKind; challengerId?: string },
): { ok: boolean; message: string; factIds: string[] } {
  if (state.activeDuel && state.activeDuel.status === 'fighting') {
    return { ok: false, message: '演武台正值激战之中，请先分出本场胜负！', factIds: [] };
  }
  if (state.pendingClutch) {
    return { ok: false, message: '请先拍板眼前的生死绝境弹窗。', factIds: [] };
  }

  const crisis = (state.sectCrisis ??= createInitialSectCrisis());
  const spec = getCurrentCrisisSpec(crisis.chapterIndex);
  const actor = pickStrongestChampion(state, params.challengerId);
  if (!actor) {
    return { ok: false, message: '宗门暂无在籍活跃门人可登台迎战。', factIds: [] };
  }

  if (params.kind === 'vanguard_outpost' && crisis.outpostCleared) {
    return { ok: false, message: '本幕敌方前哨已被拔除，可直接正面对决敌方主将！', factIds: [] };
  }

  const stats = resolveActorCombatStats(state, actor);
  const perks = new Set(state.activePerks ?? []);
  const weakened = params.kind === 'chapter_boss' && Boolean(crisis.outpostCleared);
  const oppFactor = params.kind === 'vanguard_outpost' ? 0.68 : weakened ? 0.82 : 1;

  let oppMaxHp = Math.max(85, Math.round(spec.opponent.maxHp * oppFactor));
  let oppAttack = Math.max(16, Math.round(spec.opponent.attack * (params.kind === 'vanguard_outpost' ? 0.72 : oppFactor)));
  let oppDefense = Math.max(4, Math.round(spec.opponent.defense * oppFactor));

  const logs: ActiveDuelState['logs'] = [
    {
      round: 0,
      tone: 'trait',
      text:
        params.kind === 'vanguard_outpost'
          ? `【奇袭前哨】${actor.name} 潜入寒鸦山口，突袭 ${spec.opponent.name} 的前哨防线！`
          : `【护山生死局】${actor.name} 提剑登台，正面对决「${spec.opponent.name}」${weakened ? '（前哨已破，敌势衰弱一成八！）' : '！'}`,
    },
  ];

  if (stats.traits.includes('trait_thunder')) {
    oppAttack = Math.max(10, Math.round(oppAttack * 0.85));
    logs.push({
      round: 0,
      tone: 'trait',
      text: `⚡ 「雷劫亲子」威压炸响！${spec.opponent.name} 开场攻击先被震慑压低 15%！`,
    });
  }
  if (perks.has('perk_venom_protocol')) {
    oppDefense = Math.round(oppDefense * 0.7);
    logs.push({
      round: 0,
      tone: 'cheat',
      text: '☣️ 系统插件「丹毒破甲协议」悄然蚀穿敌方 30% 护甲！',
    });
  }
  if (stats.shield > 0) {
    logs.push({
      round: 0,
      tone: 'trait',
      text: `🛡️ 「铜皮铁骨」生效，${actor.name} 开场先覆 ${stats.shield} 点罡气护盾！`,
    });
  }

  const duel: ActiveDuelState = {
    id: nextEntityId(state, 'duel'),
    kind: params.kind,
    chapterIndex: crisis.chapterIndex,
    title:
      params.kind === 'vanguard_outpost'
        ? `拔除敌哨 · 袭杀前锋`
        : `${spec.badge} · 护山实况对决`,
    actorId: actor.id,
    actorName: actor.name,
    actorPortraitId: actor.portraitId,
    actorTraits: stats.traits,
    hostHp: stats.maxHp,
    hostMaxHp: stats.maxHp,
    hostShield: stats.shield,
    hostAttack: stats.attack,
    hostDefense: stats.defense,
    opponentName:
      params.kind === 'vanguard_outpost' ? `${spec.opponent.name}·前锋营` : spec.opponent.name,
    opponentTitle:
      params.kind === 'vanguard_outpost' ? '巡山前哨头目（拔除可削弱首领18%）' : spec.opponent.title,
    opponentPortraitId: spec.opponent.portraitId ?? 'demonic_003',
    oppHp: oppMaxHp,
    oppMaxHp,
    oppAttack,
    oppDefense,
    oppMethod: spec.opponent.knownMethod,
    oppWeakenedByOutpost: weakened,
    round: 0,
    maxRounds: 14,
    oppChargingUltimate: false,
    dodgeAndCounterReady: false,
    immortalStrikeReady: false,
    burnedLifespanUsed: false,
    strikeUsed: false,
    pillsUsed: 0,
    whisperCooldown: 0,
    status: 'fighting',
    logs,
  };

  state.activeDuel = duel;
  return {
    ok: true,
    message: `${actor.name} 已踏上斗法台！随时可点击下一合或暗中动用系统底牌。`,
    factIds: [],
  };
}

export function applyDuelCheat(
  state: WorldState,
  _commandId: string,
  cheat: DuelCheatKind,
): { ok: boolean; message: string; factIds: string[] } {
  const duel = state.activeDuel;
  if (!duel || duel.status !== 'fighting') {
    return { ok: false, message: '当前不在斗法交锋之中。', factIds: [] };
  }
  const perks = new Set(state.activePerks ?? []);

  if (cheat === 'whisper_dodge') {
    if (duel.whisperCooldown > 0) {
      return { ok: false, message: `识海传音冷却中（还需 ${duel.whisperCooldown} 合）。`, factIds: [] };
    }
    if (state.daoyuanAvailable < 4) {
      return { ok: false, message: '可用道源不足（识海传音需要 4 点）。', factIds: [] };
    }
    state.daoyuanAvailable -= 4;
    duel.dodgeAndCounterReady = true;
    duel.whisperCooldown = 2;
    let rebateText = '';
    if (perks.has('perk_daoyuan_rebate')) {
      state.daoyuanAvailable += 2;
      rebateText = '（天道回扣 +2 源）';
    }
    duel.logs.push({
      round: duel.round,
      tone: 'cheat',
      text: `🔔 【系统识海传音】「左步三寸卸锋！」${duel.actorName} 瞬时看破下合杀招并蓄好 1.85× 反击！${rebateText}`,
    });
    return { ok: true, message: '识海传音成功！下回合必闪敌招并暴击反斩！', factIds: [] };
  }

  if (cheat === 'secret_pill') {
    if (duel.pillsUsed >= 2) {
      return { ok: false, message: '本场暗塞丹药已达两枚上限，经脉难再强咽。', factIds: [] };
    }
    const pillOrder = [
      'pill_humai_2_supreme',
      'pill_humai_2_high',
      'pill_humai_2_mid',
      'pill_ningling_1_low',
    ];
    let usedPill = false;
    for (const pid of pillOrder) {
      if ((state.inventory.pills[pid] ?? 0) > 0) {
        state.inventory.pills[pid] -= 1;
        usedPill = true;
        break;
      }
    }
    if (!usedPill) {
      if (state.daoyuanAvailable < 5) {
        return { ok: false, message: '丹库无药且可用道源不足 5 点。', factIds: [] };
      }
      state.daoyuanAvailable -= 5;
    }

    duel.pillsUsed += 1;
    const healRatio = perks.has('perk_venom_protocol') ? 0.5 : 0.38;
    const healAmt = Math.round(duel.hostMaxHp * healRatio);
    duel.hostHp = Math.min(duel.hostMaxHp, duel.hostHp + healAmt);
    let poisonNote = '';
    if (duel.actorTraits.includes('trait_poison_body')) {
      duel.hostAttack = Math.round(duel.hostAttack * 1.28);
      poisonNote = ' · 「百毒丹体」激发攻击暴增 +28%！';
    }
    duel.logs.push({
      round: duel.round,
      tone: 'cheat',
      text: `💊 【暗塞灵丹】神不知鬼不觉送入奇药，${duel.actorName} 瞬间回血 +${healAmt}${poisonNote}`,
    });
    return { ok: true, message: `暗塞灵丹生效，${duel.actorName} 气血回涌 +${healAmt}！`, factIds: [] };
  }

  if (cheat === 'sword_immortal_strike') {
    if (duel.strikeUsed) {
      return { ok: false, message: '本场已借过一式剑仙破空斩！', factIds: [] };
    }
    if (state.daoyuanAvailable < 10) {
      return { ok: false, message: '可用道源不足（借剑仙一击需 10 点）。', factIds: [] };
    }
    state.daoyuanAvailable -= 10;
    duel.strikeUsed = true;
    duel.immortalStrikeReady = true;
    if (perks.has('perk_daoyuan_rebate')) {
      state.daoyuanAvailable += 2;
    }
    duel.logs.push({
      round: duel.round,
      tone: 'cheat',
      text: `⚡ 【借剑仙一击】无上剑意垂落剑锋！${duel.actorName} 下一次出剑将打出 2.35× 无视护甲杀招！`,
    });
    return { ok: true, message: '剑仙一击已上膛！下一合直接倾泻！', factIds: [] };
  }

  // burn_lifespan
  if (duel.burnedLifespanUsed) {
    return { ok: false, message: '本场已暗燃过本命寿元，不可再焚。', factIds: [] };
  }
  const actor = state.members.find((m) => m.id === duel.actorId);
  if (!actor) return { ok: false, message: '未找到对应宿主。', factIds: [] };

  actor.lifespanYears = Math.max(actor.ageYears + 5, actor.lifespanYears - 15);
  duel.burnedLifespanUsed = true;
  const healAmt = Math.round(duel.hostMaxHp * 0.3);
  duel.hostHp = Math.min(duel.hostMaxHp, duel.hostHp + healAmt);
  duel.hostAttack = Math.round(duel.hostAttack * 1.35);
  duel.logs.push({
    round: duel.round,
    tone: 'cheat',
    text: `🩸 【暗燃十五载寿元】${duel.actorName} 双鬓骤白回血 +${healAmt}，本战攻击狂飙 +35%！`,
  });
  return { ok: true, message: `${duel.actorName} 燃寿拼命！回血 +${healAmt} 且攻击大增！`, factIds: [] };
}

function settleDuelOutcome(state: WorldState): void {
  const duel = state.activeDuel;
  if (!duel || duel.status === 'fighting') return;

  const actor = state.members.find((m) => m.id === duel.actorId);
  if (!actor) return;

  const perks = new Set(state.activePerks ?? []);
  const spec = getCurrentCrisisSpec(duel.chapterIndex);

  if (duel.kind === 'vanguard_outpost') {
    if (duel.status === 'victory') {
      const crisis = (state.sectCrisis ??= createInitialSectCrisis());
      crisis.outpostCleared = true;
      let daoyuanLoot = 12;
      let stoneLoot = 70;
      if (duel.actorTraits.includes('trait_looter')) {
        daoyuanLoot += 4;
        stoneLoot += 60;
      }
      if (perks.has('perk_soul_looter')) {
        daoyuanLoot += 8;
        stoneLoot += 80;
      }
      state.daoyuanAvailable += daoyuanLoot;
      state.inventory.spiritStones.low += stoneLoot;
      applyCultivationDelta(actor, 45);
      awardSystemXp(state, 25);

      duel.resultHeadline = `奇袭成功！拔除寒鸦前哨，首领「${spec.opponent.name}」战力已被削弱 18%！另掠获 +${daoyuanLoot} 道源、下品灵石×${stoneLoot}。`;
      appendFact(state, {
        type: 'battle.finished',
        visibility: 'public',
        recipientId: null,
        actorIds: [actor.id],
        publicSummary: `${actor.name} 夜袭寒鸦山口一举拔除来敌前哨，缴获下品灵石 ${stoneLoot} 枚，令「${spec.opponent.name}」声势大挫！`,
        privateSummary: null,
        systemSummary: `【前哨拔除】${duel.resultHeadline}`,
        cueTier: 'major',
      });
      appendDramaScene(state, {
        title: `${actor.name} · 奇袭拔旗`,
        badge: '兵行险着',
        tone: 'crisis',
        actorId: actor.id,
        actorName: actor.name,
        portraitId: actor.portraitId,
        beats: duel.logs.slice(-3).map((l) => l.text),
        systemTruth: `派 ${actor.name} 先拔前哨，不仅赚回 +${daoyuanLoot} 道源与 +25 算力，还把正主直接削残 18%！`,
        hostDelusion: `${actor.name} 扛着缴获的敌旗回山大笑：「区区前哨也敢挡路？多亏暗中前辈替我指了摸哨小路！」`,
        publicShock: `山门弟子看见敌军前哨旗帜倒拖回山，个个士气大振！`,
      });
    } else {
      actor.hp = Math.max(12, Math.floor(actor.maxHp * 0.3));
      if (!actor.injuries.includes('前哨遇挫轻伤')) {
        actor.injuries.push('前哨遇挫轻伤');
      }
      duel.resultHeadline = `奇袭前哨未能一鼓作气拿下，${actor.name} 负伤撤回山门整备。`;
      appendFact(state, {
        type: 'battle.finished',
        visibility: 'public',
        recipientId: null,
        actorIds: [actor.id],
        publicSummary: `${actor.name} 夜探寒鸦山口与敌军前哨交锋落败，带伤安全退回山门。`,
        privateSummary: null,
        systemSummary: `【奇袭失利】${actor.name} 未能拔除前哨，待养伤或调教后再战。`,
        cueTier: 'notable',
      });
    }
    return;
  }

  // 主将生死局结算
  if (duel.status === 'victory') {
    const customTurns: BattleTurn[] = duel.logs
      .filter((l) => l.round > 0)
      .slice(-4)
      .map((l, idx) => ({
        turn: idx + 1,
        actorName: l.tone === 'boss' ? duel.opponentName : duel.actorName,
        action: l.tone === 'cheat' ? '暗助奇招' : '实况交锋',
        detail: l.text,
        damage: 0,
        targetRemainingHp: 0,
      }));
    const modeTag = duel.strikeUsed
      ? 'future_strike'
      : duel.burnedLifespanUsed
        ? 'burn_lifespan'
        : 'direct';
    applyCrisisVictory(state, spec, actor, modeTag, customTurns);
    let extraDesc = '';
    if (duel.actorTraits.includes('trait_looter')) {
      state.daoyuanAvailable += 4;
      state.inventory.spiritStones.low += 60;
      extraDesc += ' + 雁过拔毛(+4源/60石)';
    }
    if (perks.has('perk_soul_looter')) {
      state.daoyuanAvailable += 8;
      state.inventory.spiritStones.low += 80;
      extraDesc += ' + 搜魂手(+8源/80石)';
    }
    awardSystemXp(state, 45);
    duel.resultHeadline = `护山大捷！击溃「${spec.opponent.name}」，迈入下一幕危机！赢得 ${spec.rewardSummary}${extraDesc}`;
    return;
  }

  // 主将战败
  applyCrisisDefeat(state, spec, actor, false);
  let traitNote = '';
  if (duel.actorTraits.includes('trait_moqi')) {
    state.foundationPoints += 2;
    checkAndUnlockPermissions(state);
    traitNote = '（触发「莫欺少年穷」败战砺志：道统根基额外 +2！）';
  }
  awardSystemXp(state, 20);
  duel.resultHeadline = `遗憾落败！全宗触发十二日「越挫越勇」(吐纳+40%) 并领应急补贴 +10 道源！${traitNote}`;
}

function advanceOneDuelRound(state: WorldState): void {
  const duel = state.activeDuel;
  if (!duel || duel.status !== 'fighting') return;

  duel.round += 1;
  if (duel.whisperCooldown > 0) duel.whisperCooldown -= 1;

  const r = duel.round;
  const perks = new Set(state.activePerks ?? []);
  const traits = new Set(duel.actorTraits);
  const rng = createStreamRng(state.seed, 'live_duel', duel.id, r);

  // 回合开始被动
  if (traits.has('trait_turtle') && duel.hostHp > 0 && duel.hostHp < duel.hostMaxHp) {
    const regen = Math.max(4, Math.round(duel.hostMaxHp * 0.06));
    duel.hostHp = Math.min(duel.hostMaxHp, duel.hostHp + regen);
  }
  if (traits.has('trait_battle_mad') && r > 1) {
    duel.hostAttack = Math.round(duel.hostAttack * 1.12);
  }
  if (perks.has('perk_steal_technique') && r % 2 === 0 && duel.oppAttack > 10) {
    const stolen = Math.max(2, Math.round(duel.oppAttack * 0.12));
    duel.oppAttack -= stolen;
    duel.hostAttack += stolen;
    duel.logs.push({
      round: r,
      tone: 'cheat',
      text: `👁️ 第${r}合 「偷师天眼」窃取敌方 ${stolen} 点攻势加诸自身！`,
    });
  }

  // 我方出招
  let mult = 1;
  const tags: string[] = [];
  if (duel.immortalStrikeReady) {
    mult *= 2.35;
    duel.immortalStrikeReady = false;
    tags.push('剑仙一击');
  } else if (duel.dodgeAndCounterReady) {
    mult *= traits.has('trait_forge_soul') ? 2.2 : 1.85;
    tags.push('破招暴击');
  }

  const isHalfHp = duel.hostHp <= duel.hostMaxHp * 0.5;
  if (traits.has('trait_moqi') && isHalfHp) {
    mult *= 1.55;
    tags.push('莫欺少年穷');
  }
  if (traits.has('trait_sword_bone') && r % 2 === 0) {
    mult *= 1.45;
    tags.push('天生剑骨连斩');
  }
  if (perks.has('perk_flying_swords')) {
    mult *= 1.22;
  }

  const critChance =
    10 +
    (traits.has('trait_luck_son') ? 25 : 0) +
    (perks.has('perk_desperate_fury') && isHalfHp ? 40 : 0);
  if (rng.nextInt(1, 100) <= critChance) {
    mult *= 1.4;
    tags.push('会心暴击');
  }

  const armorIgnore = traits.has('trait_thunder') || tags.includes('剑仙一击') ? 0.35 : 0;
  const effectiveOppDef = Math.round(duel.oppDefense * (1 - armorIgnore));
  const dmgOut = Math.max(6, Math.round(duel.hostAttack * mult + rng.nextInt(-2, 4) - effectiveOppDef));
  duel.oppHp = Math.max(0, duel.oppHp - dmgOut);

  let vampNote = '';
  if (perks.has('perk_desperate_fury') && isHalfHp) {
    const vamp = Math.max(3, Math.round(dmgOut * 0.2));
    duel.hostHp = Math.min(duel.hostMaxHp, duel.hostHp + vamp);
    vampNote = `（吸血 +${vamp}）`;
  }

  duel.logs.push({
    round: r,
    tone: tags.length > 0 ? 'trait' : 'host',
    text: `⚔️ 第${r}合 ${duel.actorName} 挥剑强攻，${tags.length ? `[${tags.join('·')}] ` : ''}重创 ${duel.opponentName} ${dmgOut} 点气血！${vampNote}`,
  });

  if (duel.oppHp <= 0) {
    duel.status = 'victory';
    duel.logs.push({
      round: r,
      tone: 'result',
      text: `🏆 胜负已分！${duel.opponentName} 气血见底倒退认输！`,
    });
    settleDuelOutcome(state);
    return;
  }

  // 敌方反击
  if (duel.dodgeAndCounterReady) {
    duel.dodgeAndCounterReady = false;
    duel.oppChargingUltimate = false;
    duel.logs.push({
      round: r,
      tone: 'cheat',
      text: `💨 ${duel.actorName} 依着识海密传步法飘然闪开！${duel.opponentName} 狠招彻底打空（0 伤）！`,
    });
  } else {
    const isUlt = duel.oppChargingUltimate;
    duel.oppChargingUltimate = false;
    const rawOppDmg = Math.max(
      4,
      Math.round(duel.oppAttack * (isUlt ? 2.1 : 1) + rng.nextInt(-2, 3) - duel.hostDefense),
    );
    const reducedDmg = traits.has('trait_turtle') ? Math.max(2, Math.round(rawOppDmg * 0.78)) : rawOppDmg;
    let remainingDmg = reducedDmg;
    if (duel.hostShield > 0) {
      const absorbed = Math.min(duel.hostShield, remainingDmg);
      duel.hostShield -= absorbed;
      remainingDmg -= absorbed;
    }
    duel.hostHp = Math.max(0, duel.hostHp - remainingDmg);

    let reflectNote = '';
    if (perks.has('perk_thorn_mirror') && reducedDmg > 0) {
      const refDmg = Math.max(2, Math.round(reducedDmg * 0.35));
      duel.oppHp = Math.max(0, duel.oppHp - refDmg);
      reflectNote = `（反伤棱镜弹回 ${refDmg}！）`;
    }

    duel.logs.push({
      round: r,
      tone: 'boss',
      text: `${isUlt ? `💥 【绝杀「${duel.oppMethod}」】` : `👹 `}${duel.opponentName} 轰出 ${reducedDmg} 点伤（实损 ${remainingDmg}）！${reflectNote}`,
    });

    if (duel.oppHp <= 0 && duel.hostHp > 0) {
      duel.status = 'victory';
      duel.logs.push({
        round: r,
        tone: 'result',
        text: `🏆 护山反伤棱镜建奇功！${duel.opponentName} 被生生反震倒台！`,
      });
      settleDuelOutcome(state);
      return;
    }
  }

  if (duel.hostHp <= 0 || r >= duel.maxRounds) {
    duel.status = 'defeat';
    duel.logs.push({
      round: r,
      tone: 'result',
      text: `💀 ${duel.actorName} 力竭不支退下擂台！`,
    });
    settleDuelOutcome(state);
    return;
  }

  // 每第1/4/7合结束蓄力下一回合杀招（2/5/8合释放），提示玩家动用「识海传音」躲避！
  if (r % 3 === 1 && r + 1 <= duel.maxRounds) {
    duel.oppChargingUltimate = true;
  }
}

export function stepLiveDuel(
  state: WorldState,
  _commandId: string,
  mode: 'one_round' | 'auto_finish',
): { ok: boolean; message: string; factIds: string[] } {
  const duel = state.activeDuel;
  if (!duel || duel.status !== 'fighting') {
    return { ok: false, message: '当前没有正在进行中的对决。', factIds: [] };
  }

  if (mode === 'one_round') {
    advanceOneDuelRound(state);
  } else {
    let guard = 0;
    while (state.activeDuel?.status === 'fighting' && guard < 16) {
      advanceOneDuelRound(state);
      guard += 1;
    }
  }

  const finalStatus = state.activeDuel?.status ?? 'fighting';
  return {
    ok: true,
    message:
      finalStatus === 'victory'
        ? state.activeDuel?.resultHeadline ?? '实况对决胜利！'
        : finalStatus === 'defeat'
          ? state.activeDuel?.resultHeadline ?? '实况对决失利！'
          : `第 ${state.activeDuel?.round} 合交锋结束。`,
    factIds: [],
  };
}

export function closeLiveDuel(
  state: WorldState,
  _commandId: string,
): { ok: boolean; message: string; factIds: string[] } {
  state.activeDuel = null;
  return { ok: true, message: '已收剑下台。', factIds: [] };
}

export function raidCrisisOutpost(
  state: WorldState,
  commandId: string,
  challengerId?: string,
): { ok: boolean; message: string; factIds: string[] } {
  return startLiveDuel(state, { commandId, kind: 'vanguard_outpost', challengerId });
}

export function getTraitSummaryText(traits: DestinyTraitId[]): string {
  return traits.map((id) => getTraitSpec(id).name).join(' · ');
}
