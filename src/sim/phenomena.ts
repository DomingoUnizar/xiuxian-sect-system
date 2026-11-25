import { appendFact } from './facts';
import { createStreamRng } from './prng';
import type { ArenaOpponent, MountainPhenomenon, PhenomenonKind, WorldState } from './types';

export const FIRST_PHENOMENON_TICK = 12;
export const PHENOMENON_INTERVAL_TICKS = 16;
export const PHENOMENON_DURATION_TICKS = 8;

const PHENOMENON_ORDER: readonly PhenomenonKind[] = [
  'spirit_tide',
  'challenger_at_gate',
  'earth_fire_surge',
  'spring_mist_bloom',
];

const CHALLENGERS: readonly Omit<ArenaOpponent, 'available'>[] = [
  {
    id: 'gate_challenger_li',
    name: '厉寒川',
    title: '北荒游方快刀',
    portraitId: 'rogue_002',
    realm: '炼气',
    realmLayer: 5,
    powerScore: 102,
    maxHp: 104,
    attack: 23,
    defense: 8,
    evasion: 52,
    knownMethod: '断风快刀势',
  },
  {
    id: 'gate_challenger_duan',
    name: '段凌雪',
    title: '西漠散剑客',
    portraitId: 'righteous_021',
    realm: '炼气',
    realmLayer: 6,
    powerScore: 108,
    maxHp: 110,
    attack: 25,
    defense: 9,
    evasion: 54,
    knownMethod: '落沙逐影剑',
  },
  {
    id: 'gate_challenger_shen',
    name: '沈苍',
    title: '南疆百兽行者',
    portraitId: 'mortal_006',
    realm: '炼气',
    realmLayer: 4,
    powerScore: 98,
    maxHp: 98,
    attack: 21,
    defense: 9,
    evasion: 50,
    knownMethod: '虎啸震山拳',
  },
];

function buildPhenomenonSpec(
  kind: PhenomenonKind,
  startedTick: number,
  expiresAtTick: number,
  seed: number,
): MountainPhenomenon {
  const rng = createStreamRng(seed, 'phenomenon', `spec-${startedTick}`, 0);
  if (kind === 'spirit_tide') {
    return {
      id: `phenom_${startedTick}`,
      kind,
      name: '灵潮夜涌',
      description: '天外灵脉潮汐漫过山门护阵，吐纳如鱼得水、冲破大境壁垒亦顺三分。',
      buffLabel: '全宗吐纳 +50% · 破境把握 +15%',
      startedTick,
      expiresAtTick,
    };
  }
  if (kind === 'earth_fire_surge') {
    return {
      id: `phenom_${startedTick}`,
      kind,
      name: '丹霞地火正旺',
      description: '药庐地底赤脉沸动，温炉控火格外省力，后山灵圃药苗亦随之疯长。',
      buffLabel: '炼丹稳焰成色 +1 · 采药附带护脉草',
      startedTick,
      expiresAtTick,
    };
  }
  if (kind === 'spring_mist_bloom') {
    return {
      id: `phenom_${startedTick}`,
      kind,
      name: '寒泉灵雾显露',
      description: '后山灵泉泛起玉白灵雾，潮纹原石与灵花晨露正易寻觅。',
      buffLabel: '探泉 / 出山历练额外多得灵材',
      startedTick,
      expiresAtTick,
    };
  }

  const picked = rng.pick(CHALLENGERS);
  const challenger: ArenaOpponent = { ...picked, available: true };
  return {
    id: `phenom_${startedTick}`,
    kind: 'challenger_at_gate',
    name: `散修叩山 · ${challenger.name}`,
    description: `${challenger.title}「${challenger.name}」（${challenger.realm}${challenger.realmLayer}层 · 战力 ${challenger.powerScore}）持帖叩山求战，胜之可得丰厚灵石、声望与回馈！`,
    buffLabel: '派发「迎敌护山」击败可获 +6 声望、+40 灵石、+5 回馈',
    startedTick,
    expiresAtTick,
    challenger,
  };
}

/**
 * 确定性山门天时与突发风波：
 * 仅从第 12 刻起按固定周期轮转，完全依赖 tick 与独立 seed 流，严守离在线及分片哈希等价。
 */
export function stepPhenomena(state: WorldState): void {
  if (state.tick < FIRST_PHENOMENON_TICK) {
    return;
  }

  if (state.activePhenomenon && state.tick >= state.activePhenomenon.expiresAtTick) {
    state.activePhenomenon = null;
  }

  if ((state.tick - FIRST_PHENOMENON_TICK) % PHENOMENON_INTERVAL_TICKS !== 0) {
    return;
  }

  const cycle = Math.floor((state.tick - FIRST_PHENOMENON_TICK) / PHENOMENON_INTERVAL_TICKS);
  const offset = Math.abs(state.seed) % PHENOMENON_ORDER.length;
  const kind = PHENOMENON_ORDER[(cycle + offset) % PHENOMENON_ORDER.length];
  const expiresAtTick = state.tick + PHENOMENON_DURATION_TICKS;
  const phenom = buildPhenomenonSpec(kind, state.tick, expiresAtTick, state.seed);
  state.activePhenomenon = phenom;

  appendFact(state, {
    type: 'world.phenomenon',
    visibility: 'public',
    recipientId: null,
    actorIds: [],
    publicSummary: `【山门天时】${phenom.name}现于${state.sectName}（持续至第 ${expiresAtTick} 刻）：${phenom.description}`,
    privateSummary: null,
    systemSummary: `山门异象降临「${phenom.name}」（${phenom.buffLabel}），可趁势点将布局！`,
    cueTier: kind === 'challenger_at_gate' ? 'notable' : 'routine',
  });
}
