import { formatActionReport } from '../content/narrativePools';
import { getItemById, getRecipeById } from '../content/validate';
import type { ItemQuality } from './constants';
import { appendFact, nextEntityId } from './facts';
import { createStreamRng } from './prng';
import type { AlchemyFact, Member, WorldState } from './types';

export interface AlchemyAttemptResult {
  factId: string;
  alchemyFact: AlchemyFact;
  success: boolean;
  producedPillId?: string;
}

export function canAffordRecipe(state: Pick<WorldState, 'inventory'>, recipeId: string): { ok: boolean; reason?: string } {
  if (state.inventory.furnaces < 1) {
    return { ok: false, reason: '宗门库中尚无可用凡炉。' };
  }
  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    return { ok: false, reason: `未知丹方 ${recipeId}。` };
  }
  for (const [herbId, qty] of Object.entries(recipe.inputs)) {
    const owned = state.inventory.herbs[herbId] ?? 0;
    if (owned < qty) {
      const herbName = getItemById(herbId)?.name ?? herbId;
      return { ok: false, reason: `药材不足：${herbName} 仅余 ${owned} 份，需 ${qty} 份。` };
    }
  }
  return { ok: true };
}

/**
 * 真实四步炼丹：辨药 → 行火 → 合药 → 分丹。
 * 消耗真实库存药材，生成唯一 AlchemyFact 并把成品丹药入库。
 */
export function runAlchemyAttempt(
  state: WorldState,
  actor: Member,
  recipeId: string,
  options: { useFenhuoMethod?: boolean; missionId?: string; forceAttemptIndex?: number } = {},
): AlchemyAttemptResult | null {
  const afford = canAffordRecipe(state, recipeId);
  if (!afford.ok) {
    return null;
  }
  const recipe = getRecipeById(recipeId)!;
  const counterKey = `alchemy:${actor.id}:${recipeId}`;
  const attemptIdx = options.forceAttemptIndex ?? (state.rngAttemptCounters[counterKey] ?? 0);
  state.rngAttemptCounters[counterKey] = attemptIdx + 1;

  const rng = createStreamRng(state.seed, 'alchemy', counterKey, attemptIdx);

  // 1. 扣除真实药材库存（保证永不出现负数）
  for (const [herbId, qty] of Object.entries(recipe.inputs)) {
    state.inventory.herbs[herbId] = Math.max(0, (state.inventory.herbs[herbId] ?? 0) - qty);
  }

  // 2. 辨药与行火判定
  const useFenhuo = Boolean(options.useFenhuoMethod && actor.knownMethods.includes('method_fenhuo_tiqing'));
  const hasKeepFire = Boolean(actor.grantedAbilities?.includes('ability_keep_fire'));
  const hasWarmCore = Boolean(state.inventory.furnaceHasWarmCore);
  const hasEarthFireSurge = state.activePhenomenon?.kind === 'earth_fire_surge';
  const tempStart = recipe.baseFurnaceTemp;
  const comprehensionMod = Math.floor((actor.aptitude.comprehension - 50) / 15);
  const fireSkillMod =
    actor.craftRank.alchemy +
    (useFenhuo ? 2 : 0) +
    (hasKeepFire ? 2 : 0) +
    (hasWarmCore ? 1 : 0) +
    (hasEarthFireSurge ? 1 : 0) +
    (actor.spiritRoot.elements.includes('火') ? 1 : 0);
  const roll = rng.nextInt(-2, 2);

  // 去浮浊升温；分火提清法 / 留一息火 / 潮纹温脉炉胆均可稳住炉温防止爆炉
  const impurityRemoved = Math.min(recipe.baseImpurity, Math.max(1, 1 + Math.floor(fireSkillMod / 2)));
  const tempDrift =
    useFenhuo || hasKeepFire || hasWarmCore
      ? 0
      : Math.max(0, impurityRemoved - 1) + Math.max(0, roll - 1);
  const tempEnd = tempStart + tempDrift;

  const tempInWindow = tempEnd >= recipe.targetTempMin && tempEnd <= recipe.targetTempMax;
  const skillScore = comprehensionMod + fireSkillMod + roll + (actor.injuries.length > 0 ? -2 : 0);
  const success = tempInWindow && skillScore >= (recipe.pillTier === 2 ? 2 : 0);

  const alchemyFactId = nextEntityId(state, 'alc');
  const peerName = state.members.find((m) => m.id !== actor.id && m.status === 'active')?.name ?? '丹童';
  const primaryHerbId = Object.keys(recipe.inputs)[0];
  const primaryHerbName = (primaryHerbId ? getItemById(primaryHerbId)?.name : undefined) ?? recipe.name;
  const reportSalt = `${state.seed}:${counterKey}:${attemptIdx}`;
  const warmupLine = formatActionReport(
    'alchemy_step',
    'warmup',
    { actor: actor.name, peer: peerName, item: primaryHerbName },
    reportSalt,
  );
  const purifyLine = formatActionReport(
    'alchemy_step',
    'purify',
    { actor: actor.name, peer: peerName, item: primaryHerbName },
    reportSalt,
  );

  if (!success) {
    const failScene = formatActionReport(
      'alchemy_step',
      'fail',
      { actor: actor.name, peer: peerName, item: recipe.name },
      reportSalt,
    );
    const failureReason = !tempInWindow
      ? `合药时炉温落至 ${tempEnd}（需 ${recipe.targetTempMin}~${recipe.targetTempMax}），药气散逸未能凝丹。`
      : `火候转折微差，药力未能聚拢成丸。`;
    const shortReport = `${actor.name} 开凡炉试炼「${recipe.name}」，${failureReason}`;
    const detailedReport = [
      `【辨药】取${Object.entries(recipe.inputs).map(([k, v]) => `${getItemById(k)?.name ?? k}×${v}`).join('、')}入凡炉。`,
      `【行火】起温 ${tempStart}，尝试去除浮浊 ${impurityRemoved} 缕${useFenhuo ? '（施展分火提清法稳焰）' : ''}。`,
      `【炉前实况】${warmupLine} ${purifyLine} ${failScene}`,
      `【结果】${failureReason} 药材已实耗，需休整后再开下一炉。`,
    ].join('\n');

    const alchemyFact: AlchemyFact = {
      id: alchemyFactId,
      tick: state.tick,
      actorId: actor.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      usedMethodId: useFenhuo ? 'method_fenhuo_tiqing' : 'method_basic_fire',
      seedRef: `${state.seed}:alchemy:${counterKey}:${attemptIdx}`,
      furnaceTempStart: tempStart,
      furnaceTempEnd: tempEnd,
      impurityRemoved,
      potency: 0,
      success: false,
      destinationNote: '此炉成渣，未有丹药入库。',
      failureReason,
      shortReport,
      detailedReport,
    };
    state.alchemyFacts[alchemyFactId] = alchemyFact;

    const fact = appendFact(state, {
      type: 'alchemy.finished',
      visibility: 'public',
      recipientId: null,
      actorIds: [actor.id],
      missionId: options.missionId,
      publicSummary: shortReport,
      privateSummary: null,
      systemSummary: `${actor.name} 试炼 ${recipe.name} 失利（${failureReason}）。`,
      details: detailedReport,
      alchemyFactId,
      cueTier: 'routine',
    });

    return {
      factId: fact.id,
      alchemyFact,
      success: false,
    };
  }

  // 成丹质量判定
  const isMidOrHigh = useFenhuo || hasKeepFire || hasWarmCore || skillScore >= 3;
  let producedPillId = isMidOrHigh ? recipe.outputMidId : recipe.outputLowId;
  let usedDewPetals = false;
  if (
    recipeId === 'recipe_humai' &&
    (state.inventory.herbs.mat_dew_petals ?? 0) >= 1 &&
    (hasKeepFire || hasWarmCore) &&
    getItemById('pill_humai_2_supreme')
  ) {
    state.inventory.herbs.mat_dew_petals = Math.max(0, (state.inventory.herbs.mat_dew_petals ?? 1) - 1);
    producedPillId = 'pill_humai_2_supreme';
    usedDewPetals = true;
  }
  const itemDef = getItemById(producedPillId)!;
  const quality = itemDef.quality as ItemQuality;

  // 实物入宗门丹库
  state.inventory.pills[producedPillId] = (state.inventory.pills[producedPillId] ?? 0) + 1;
  const vaultCount = state.inventory.pills[producedPillId];

  // 若首次成丹且技艺尚为 0，晋升为一品丹修入门；已是一品且使用高阶手法可积攒升二品经验
  if (!actor.hasCompletedFirstAlchemy) {
    actor.hasCompletedFirstAlchemy = true;
    actor.craftRank.alchemy = Math.max(1, actor.craftRank.alchemy);
  } else if (useFenhuo && actor.craftRank.alchemy < 2) {
    actor.craftRank.alchemy = 2;
  }

  const successScene = formatActionReport(
    'alchemy_step',
    'success',
    { actor: actor.name, peer: peerName, item: itemDef.name },
    reportSalt,
  );
  const craftBoostNotes: string[] = [];
  if (hasWarmCore) craftBoostNotes.push('潮纹温脉炉胆引潮控温');
  if (hasKeepFire) craftBoostNotes.push('留一息火稳焰');
  if (hasEarthFireSurge) craftBoostNotes.push('借丹霞地火旺势凝丹');
  if (usedDewPetals) craftBoostNotes.push('封入完整带露玉髓花一滴');
  const boostClause = craftBoostNotes.length > 0 ? `（${craftBoostNotes.join('、')}）` : '';

  const destinationNote = `已封瓶存入宗门丹库（库中现存 ${itemDef.name} ${vaultCount} 枚），可供门人疗伤或冲关服用。`;
  const shortReport = `${actor.name} 驾驭凡炉依「${recipe.name}」成丹一枚（${itemDef.name}${boostClause}），${destinationNote}`;
  const detailedReport = [
    `【辨药】核验主辅药材药性苏醒先后，投${Object.entries(recipe.inputs).map(([k, v]) => `${getItemById(k)?.name ?? k}×${v}`).join('、')}${usedDewPetals ? '、带露玉髓花×1' : ''}入炉。`,
    `【行火】炉温由 ${tempStart} 调至 ${tempEnd}，去浮浊 ${impurityRemoved} 缕${useFenhuo ? '（以「分火提清法」分层控火）' : ''}${boostClause}。`,
    `【炉前实况】${warmupLine} ${purifyLine} ${successScene}`,
    `【合药分丹】药力凝为一丸「${itemDef.name}」（${quality}，含轻微丹毒 ${itemDef.toxicity ?? 1} 点）。`,
    `【去向】${destinationNote}`,
  ].join('\n');

  const alchemyFact: AlchemyFact = {
    id: alchemyFactId,
    tick: state.tick,
    actorId: actor.id,
    recipeId: recipe.id,
    recipeName: recipe.name,
    usedMethodId: useFenhuo ? 'method_fenhuo_tiqing' : 'method_basic_fire',
    seedRef: `${state.seed}:alchemy:${counterKey}:${attemptIdx}`,
    furnaceTempStart: tempStart,
    furnaceTempEnd: tempEnd,
    impurityRemoved,
    potency: 12,
    success: true,
    pillTier: recipe.pillTier,
    pillQuality: quality,
    pillToxicity: itemDef.toxicity ?? 1,
    destination: 'sect_vault',
    destinationNote,
    shortReport,
    detailedReport,
  };
  state.alchemyFacts[alchemyFactId] = alchemyFact;

  const fact = appendFact(state, {
    type: 'alchemy.finished',
    visibility: 'public',
    recipientId: null,
    actorIds: [actor.id],
    missionId: options.missionId,
    publicSummary: shortReport,
    privateSummary: null,
    systemSummary: `${actor.name} 真实炼成 ${itemDef.name}（${destinationNote}）。`,
    details: detailedReport,
    alchemyFactId,
    cueTier: 'notable',
  });

  return {
    factId: fact.id,
    alchemyFact,
    success: true,
    producedPillId,
  };
}
