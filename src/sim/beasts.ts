import { getMethodById } from '../content/validate';
import { appendFact, nextEntityId } from './facts';
import { evaluateHeritageOnMethodSuccess } from './heritage';
import type { BeastFact, Member, WorldState } from './types';

/**
 * 御兽探泉采露：以「循铃御兽诀」协同灵兽深入寒泉谷，携回潮纹玉与完整带露玉髓花供丹堂与器堂共用。
 */
export function runBeastExpedition(
  state: WorldState,
  actor: Member,
  options: { missionId?: string } = {},
): { factId: string; beastFact: BeastFact } {
  const methodId = 'method_beast_xunling';
  const methodName = getMethodById(methodId)?.name ?? '循铃御兽诀';

  if (!actor.knownMethods.includes(methodId)) {
    const elder = state.members.find(
      (m) => m.id !== actor.id && m.status === 'active' && m.knownMethods.includes(methodId),
    );
    actor.knownMethods.push(methodId);
    if (elder) {
      appendFact(state, {
        type: 'cultivation.progressed',
        visibility: 'public',
        recipientId: null,
        actorIds: [elder.id, actor.id],
        publicSummary: `${elder.name} 演示「${methodName}」呼哨按律之法，${actor.name} 当场习得并与宗门灵兽熟络。`,
        privateSummary: null,
        systemSummary: `御兽传艺：${actor.name} 自 ${elder.name} 处学会「${methodName}」。`,
      });
    }
  }

  state.spiritBeasts ??= [];
  const beast =
    state.spiritBeasts.find((b) => b.id === actor.bondedBeastId) ??
    state.spiritBeasts.find((b) => b.bondedMemberId === null) ??
    state.spiritBeasts[0];

  if (beast && !actor.bondedBeastId) {
    actor.bondedBeastId = beast.id;
    if (!beast.bondedMemberId) {
      beast.bondedMemberId = actor.id;
    }
  }

  const awakenedUsed = Boolean(
    beast?.awakened || actor.grantedAbilities?.includes('ability_beast_awakening'),
  );
  if (awakenedUsed && beast && !beast.awakened) {
    beast.awakened = true;
    if (!beast.traits.includes('隔岩辨泉')) {
      beast.traits.push('隔岩辨泉');
    }
  }

  const hasMistBloom = state.activePhenomenon?.kind === 'spring_mist_bloom';
  const jadeGain = awakenedUsed ? 2 : 1;
  const dewGain = (awakenedUsed ? 2 : 1) + (hasMistBloom ? 1 : 0);
  const humaiGain = 1;

  state.inventory.materials ??= {};
  state.inventory.materials.mat_chaowen_jade =
    (state.inventory.materials.mat_chaowen_jade ?? 0) + jadeGain;
  state.inventory.herbs.mat_dew_petals =
    (state.inventory.herbs.mat_dew_petals ?? 0) + dewGain;
  state.inventory.herbs.herb_humai =
    (state.inventory.herbs.herb_humai ?? 0) + humaiGain;

  const beastName = beast?.name ?? '听泉云纹鹿';
  const gatheredItems = [
    { itemId: 'mat_chaowen_jade', itemName: '潮纹玉', qty: jadeGain },
    { itemId: 'mat_dew_petals', itemName: '带露玉髓花', qty: dewGain },
    { itemId: 'herb_humai', itemName: '护脉草', qty: humaiGain },
  ];

  state.beastFacts ??= {};
  const beastFactId = nextEntityId(state, 'bst');
  const shortReport = `${actor.name} 循铃呼应「${beastName}」赴寒泉采露，${
    awakenedUsed ? '灵兽血脉已醒隔岩辨出隐泉，' : ''
  }${hasMistBloom ? '恰逢寒泉灵雾显露多寻得一株带露灵花，' : ''}携回潮纹玉×${jadeGain}、带露玉髓花×${dewGain} 与护脉草×${humaiGain} 交入宗库。`;

  const detailedReport = [
    `【呼兽同行】${actor.name} 催动「${methodName}」，与「${beastName}」（特性：${beast?.traits.join('、') ?? '伏耳听泉'}）结伴进谷。`,
    `【辨泉采露】${awakenedUsed ? '血脉觉醒发力，灵兽隔岩寻得双脉泉眼并轻步衔花不落晨露。' : '灵兽贴岩听泉避开浊雾，踏浅水寻回原玉与晨露花株。'}`,
    `【入库】潮纹玉+${jadeGain}（可交器堂锻剑或嵌炉胆）、带露玉髓花+${dewGain}（可助丹堂冲二阶极品护脉丹）、护脉草+${humaiGain}。`,
  ].join('\n');

  const beastFact: BeastFact = {
    id: beastFactId,
    tick: state.tick,
    actorId: actor.id,
    beastId: beast?.id ?? 'beast_sect_deer',
    beastName,
    awakenedUsed,
    gatheredItems,
    shortReport,
    detailedReport,
  };
  state.beastFacts[beastFactId] = beastFact;

  const mainFact = appendFact(state, {
    type: 'beast.expedition',
    visibility: 'public',
    recipientId: null,
    actorIds: [actor.id],
    missionId: options.missionId,
    publicSummary: shortReport,
    privateSummary: null,
    systemSummary: shortReport,
    details: detailedReport,
    cueTier: 'notable',
  });

  evaluateHeritageOnMethodSuccess(state, actor, methodId, mainFact.id);
  return { factId: mainFact.id, beastFact };
}
