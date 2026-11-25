import { getItemById, getMethodById } from '../content/validate';
import { appendFact, nextEntityId } from './facts';
import { evaluateHeritageOnMethodSuccess } from './heritage';
import { computeMemberPowerScore } from './power';
import type { ForgingFact, HostEquipment, Member, WorldState } from './types';

export function canAffordForging(
  state: Pick<WorldState, 'inventory'>,
  mode: 'sword' | 'core',
): { ok: boolean; reason?: string } {
  const jade = state.inventory.materials?.mat_chaowen_jade ?? 0;
  if (jade < 1) {
    return { ok: false, reason: '库中潮纹玉不足（需 1 份），可先派宿主携灵兽赴寒泉寻回。' };
  }
  if (mode === 'core' && state.inventory.furnaceHasWarmCore) {
    return { ok: false, reason: '宗门凡炉已嵌装「潮纹温脉炉胆」，无须重复锻制炉胆。' };
  }
  return { ok: true };
}

/**
 * 炼器：同材（潮纹玉）因已学手法不同产出迥异器物并服务全宗（储水回锋剑 / 潮纹温脉炉胆）。
 */
export function runForgingAttempt(
  state: WorldState,
  actor: Member,
  mode: 'sword' | 'core',
  options: { missionId?: string } = {},
): { factId: string; forgingFact: ForgingFact; productName: string } | null {
  const afford = canAffordForging(state, mode);
  if (!afford.ok) return null;

  state.inventory.materials = state.inventory.materials ?? {};
  state.inventory.materials.mat_chaowen_jade = Math.max(
    0,
    (state.inventory.materials.mat_chaowen_jade ?? 0) - 1,
  );

  const methodId = mode === 'sword' ? 'method_forging_fengwen' : 'method_forging_ludan';
  const methodName = getMethodById(methodId)?.name ?? (mode === 'sword' ? '接锋蓄水纹' : '温炉控潮纹');

  if (!actor.knownMethods.includes(methodId)) {
    const teacher = state.members.find(
      (m) => m.id !== actor.id && m.status === 'active' && m.knownMethods.includes(methodId),
    );
    actor.knownMethods.push(methodId);
    if (teacher) {
      appendFact(state, {
        type: 'cultivation.progressed',
        visibility: 'public',
        recipientId: null,
        actorIds: [teacher.id, actor.id],
        publicSummary: `${teacher.name} 当炉辨识潮纹玉天然水路，将「${methodName}」接纹关窍授与 ${actor.name}。`,
        privateSummary: null,
        systemSummary: `器堂授艺：${actor.name} 从 ${teacher.name} 处习得「${methodName}」。`,
      });
    }
  }

  actor.craftRank.forging = Math.max(1, actor.craftRank.forging);
  state.forgingFacts ??= {};
  const forgingFactId = nextEntityId(state, 'frg');

  if (mode === 'sword') {
    const weaponId = nextEntityId(state, 'wpn');
    const craftedSword: HostEquipment = {
      id: weaponId,
      templateId: 'weapon_chaowen_sword',
      name: '储水回锋剑',
      tier: '凡阶',
      quality: '上品',
      iconPath: 'assets/weapons/ma_tu_sword_t02_006.png',
      durability: 42,
      maxDurability: 42,
      attackBonus: 11,
      defenseBonus: 5,
      specialTrait: 'water_tide',
    };

    const peer =
      state.members.find(
        (m) =>
          m.id !== actor.id &&
          m.status === 'active' &&
          m.role === 'disciple' &&
          (m.equippedWeapon?.attackBonus ?? 0) < craftedSword.attackBonus,
      ) ??
      state.members.find(
        (m) =>
          m.id !== actor.id &&
          m.status === 'active' &&
          (m.equippedWeapon?.attackBonus ?? 0) < craftedSword.attackBonus,
      ) ??
      null;

    let placementNote = '已收入宗门藏器库，待有缘弟子领佩出战。';
    if (peer) {
      if (peer.equippedWeapon) {
        state.inventory.weapons.push(peer.equippedWeapon);
      }
      peer.equippedWeapon = craftedSword;
      placementNote = `已当场交由同门 ${peer.name} 佩带出战（战力增至 ${computeMemberPowerScore(peer)}）。`;
    } else if (
      state.inventory.weapons.filter((w) => w.name === '储水回锋剑').length >= 3
    ) {
      state.inventory.spiritStones.low += 25;
      placementNote = '宗门藏器库已有充足备剑，此剑寄售仙坊换得下品灵石×25入库。';
    } else {
      state.inventory.weapons.push(craftedSword);
    }

    const shortReport = `${actor.name} 取潮纹玉依「${methodName}」锻成凡阶上品「储水回锋剑」，${placementNote}`;
    const detailedReport = [
      `【辨纹】验定潮纹玉（余 ${state.inventory.materials.mat_chaowen_jade} 份）水脉走向，顺接剑格。`,
      `【铸形】施展「${methodName}」封入逐息蓄潮回路，锋口暗蕴清光。`,
      `【交付】${placementNote}`,
    ].join('\n');

    const forgingFact: ForgingFact = {
      id: forgingFactId,
      tick: state.tick,
      actorId: actor.id,
      methodId,
      methodName,
      materialId: 'mat_chaowen_jade',
      productKind: 'weapon',
      productId: weaponId,
      productName: craftedSword.name,
      recipientMemberId: peer?.id ?? null,
      shortReport,
      detailedReport,
    };
    state.forgingFacts[forgingFactId] = forgingFact;

    const mainFact = appendFact(state, {
      type: 'forging.finished',
      visibility: 'public',
      recipientId: null,
      actorIds: peer ? [actor.id, peer.id] : [actor.id],
      missionId: options.missionId,
      publicSummary: shortReport,
      privateSummary: null,
      systemSummary: shortReport,
      details: detailedReport,
      cueTier: 'notable',
    });

    evaluateHeritageOnMethodSuccess(state, actor, methodId, mainFact.id);
    return { factId: mainFact.id, forgingFact, productName: craftedSword.name };
  }

  // 同一种潮纹玉改走「温炉控潮纹」炼成炉胆，嵌装丹堂凡炉直接提升炼丹成色
  state.inventory.furnaceHasWarmCore = true;
  const shortReport = `${actor.name} 取潮纹玉依「${methodName}」炼成「潮纹温脉炉胆」，嵌装丹堂凡炉，此后开炉可自引潮息稳温提清。`;
  const detailedReport = [
    `【辨纹】依「${methodName}」理顺潮纹玉天然回潮纹路，使之随炉火自主吞吐水息。`,
    `【嵌炉】将「潮纹温脉炉胆」嵌入丹堂凡炉底座，可替炼丹师稳住升温漂移并提成丹品相。`,
  ].join('\n');

  const forgingFact: ForgingFact = {
    id: forgingFactId,
    tick: state.tick,
    actorId: actor.id,
    methodId,
    methodName,
    materialId: 'mat_chaowen_jade',
    productKind: 'furnace_core',
    productId: 'relic_chaowen_core',
    productName: '潮纹温脉炉胆',
    recipientMemberId: null,
    shortReport,
    detailedReport,
  };
  state.forgingFacts[forgingFactId] = forgingFact;

  const mainFact = appendFact(state, {
    type: 'forging.finished',
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
  return { factId: mainFact.id, forgingFact, productName: '潮纹温脉炉胆' };
}

export function equipWeaponFromVault(
  state: WorldState,
  memberId: string,
  weaponId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === memberId);
  if (!member || member.status === 'departed' || member.status === 'dead') {
    return { ok: false, message: '无法为离宗或已故门人更换佩器。', factIds: [] };
  }
  const idx = state.inventory.weapons.findIndex((w) => w.id === weaponId);
  if (idx === -1) {
    return { ok: false, message: '藏器库中未见所选法器。', factIds: [] };
  }
  const [picked] = state.inventory.weapons.splice(idx, 1);
  if (member.equippedWeapon) {
    state.inventory.weapons.push(member.equippedWeapon);
  }
  member.equippedWeapon = picked;
  const newPower = computeMemberPowerScore(member);
  const f = appendFact(state, {
    type: 'cultivation.progressed',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    publicSummary: `${member.name} 自宗门藏器库换佩「${picked.name}」（${picked.tier}${picked.quality}），常态战力升至 ${newPower}。`,
    privateSummary: null,
    systemSummary: `${member.name} 已装备库中法器「${picked.name}」（战力 ${newPower}）。`,
    cueTier: 'routine',
  });
  return {
    ok: true,
    message: `${member.name} 已换佩「${picked.name}」。`,
    factIds: [f.id],
  };
}

export function getForgingItemName(id: string): string {
  return getItemById(id)?.name ?? id;
}
