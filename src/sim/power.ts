import { REALMS, type Realm } from './constants';
import type { Member } from './types';

const REALM_BASE_POWER: Record<Realm, number> = {
  凡人: 15,
  淬体: 40,
  炼气: 80,
  筑基: 160,
  紫府: 280,
  金丹: 450,
  元婴: 720,
  出窍: 1050,
  化神: 1500,
  炼虚: 2100,
  合体: 2900,
  大乘: 3900,
  渡劫: 5200,
  无漏: 7000,
};

/**
 * 炼气仅可发挥凡阶法器约一半威力；筑基方具完全掌握之资（世界设定集 3.8）。
 */
export function getArtifactMasteryFactor(memberRealm: Realm, artifactTier: string): number {
  const realmIdx = REALMS.indexOf(memberRealm);
  const minRealmByTier: Record<string, number> = {
    凡阶: REALMS.indexOf('炼气'),
    玄阶: REALMS.indexOf('筑基'),
    地阶: REALMS.indexOf('紫府'),
    天阶: REALMS.indexOf('金丹'),
    帝器: REALMS.indexOf('元婴'),
  };
  const minIdx = minRealmByTier[artifactTier] ?? 2;
  if (realmIdx < minIdx) {
    return 0;
  }
  if (realmIdx === minIdx) {
    return 0.5;
  }
  return 1;
}

export function getCultivationPerRound(member: Pick<Member, 'caveSupplyPerRound' | 'meridianCapPerRound' | 'manualRatePerRound' | 'injuries'>): number {
  const base = Math.min(member.caveSupplyPerRound, member.meridianCapPerRound, member.manualRatePerRound);
  if (member.injuries.length > 0) {
    return Math.max(1, Math.floor(base * 0.6));
  }
  return Math.max(1, base);
}

/**
 * 纸面常态战力标尺：
 * 炼气早期无神兵/天品灵根时维持 80..120 精细标尺以保障试剑平衡；
 * 一旦晋入筑基及以上、觉醒天品仙根、或佩带高阶神兵，即解除 20/12/8 上限封锁，展现真实战力飞跃！
 */
export function computeMemberPowerScore(member: Member): number {
  const base = REALM_BASE_POWER[member.realm] ?? 80;
  const methodAttack = member.knownMethods.includes('method_jinglei_jue')
    ? 10
    : member.knownMethods.includes('method_qinglian_huifeng')
      ? 8
      : member.knownMethods.includes('method_basic_sword')
        ? 4
        : 1;
  const weaponMastery = member.equippedWeapon
    ? getArtifactMasteryFactor(member.realm, member.equippedWeapon.tier)
    : 0;
  const weaponAttack = member.equippedWeapon
    ? Math.round(member.equippedWeapon.attackBonus * weaponMastery)
    : 0;
  const weaponDefense = member.equippedWeapon
    ? Math.round(member.equippedWeapon.defenseBonus * weaponMastery)
    : 0;

  const isEarlyBaseline =
    REALMS.indexOf(member.realm) <= REALMS.indexOf('炼气') &&
    (!member.equippedWeapon || (member.equippedWeapon.tier === '凡阶' && member.equippedWeapon.attackBonus <= 16)) &&
    member.spiritRoot.grade !== '天品' &&
    member.meridianCapPerRound <= 11;

  const bondBonus = Math.min(
    30,
    (member.bonds ?? []).reduce((acc, b) => acc + b.powerBonus, 0),
  );

  if (isEarlyBaseline) {
    const cultivationScore = Math.min(8, Math.floor(member.cultivation / 40));
    const layerScore = Math.min(4, Math.floor((member.realmLayer - 1) / 2));
    const offense = Math.min(20, cultivationScore + layerScore + methodAttack + weaponAttack);
    const defense = Math.min(12, Math.floor(member.aptitude.bone / 15) + weaponDefense + Math.floor(member.foundation / 3));
    const sustain = Math.min(8, Math.floor(member.aptitude.soul / 22) + Math.floor(member.meridianCapPerRound / 3));
    const penalty = member.injuries.length > 0 ? Math.min(12, member.injuries.length * 5) : 0;
    return Math.max(10, base + offense + defense + sustain - penalty) + bondBonus;
  }

  const cultivationScore = Math.min(45, Math.floor(member.cultivation / 32));
  const layerScore = (member.realmLayer - 1) * 5;
  const rootBonus = member.spiritRoot.grade === '天品' ? 28 : member.spiritRoot.grade === '地品' ? 8 : 0;
  const offense = cultivationScore + layerScore + methodAttack + weaponAttack + rootBonus;
  const defense = Math.floor(member.aptitude.bone / 14) + weaponDefense + Math.floor(member.foundation * 0.8);
  const sustain =
    Math.floor(member.aptitude.soul / 20) +
    Math.floor(member.meridianCapPerRound * 0.8) +
    (member.grantedAbilities?.length ?? 0) * 8;
  const penalty = member.injuries.length > 0 ? Math.min(24, member.injuries.length * 6) : 0;

  return Math.max(10, base + offense + defense + sustain - penalty) + bondBonus;
}
