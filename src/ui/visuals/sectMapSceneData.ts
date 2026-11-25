export type MapZoneId =
  | 'gate'
  | 'hall'
  | 'alchemy'
  | 'arena'
  | 'heritage'
  | 'pass'
  | 'spring';

export interface MapZoneSpec {
  id: MapZoneId;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  radius: number;
  labelX: number;
  labelY: number;
  accentColor: string;
  actionHint: string;
}

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1195;

export const ALCHEMY_FURNACE = { x: 380, y: 530 };
export const ARENA_CENTER = { x: 1248, y: 658 };

export const MAP_ZONES: MapZoneSpec[] = [
  {
    id: 'gate',
    name: '山门 · 迎仙台',
    subtitle: '五域来投候考与入宗绑定之处',
    x: 455,
    y: 835,
    radius: 165,
    labelX: 465,
    labelY: 845,
    accentColor: '#3e9d82',
    actionHint: '点击开启/查看开山招徒',
  },
  {
    id: 'alchemy',
    name: '丹霞药庐 · 灵圃',
    subtitle: '凡炉起火、凝灵辨药、分火提清成丹',
    x: 345,
    y: 525,
    radius: 145,
    labelX: 355,
    labelY: 650,
    accentColor: '#d97b3e',
    actionHint: '点击选中「首炼灵丹」或丹堂密令',
  },
  {
    id: 'heritage',
    name: '承法藏经阁',
    subtitle: '典籍秘法传习、道统根基与常开悬赏',
    x: 355,
    y: 265,
    radius: 115,
    labelX: 365,
    labelY: 382,
    accentColor: '#4893a8',
    actionHint: '点击查看道统传承与自动悬赏',
  },
  {
    id: 'hall',
    name: '天枢主殿',
    subtitle: '宗门中枢、道源私令派发与门人总览',
    x: 880,
    y: 270,
    radius: 170,
    labelX: 870,
    labelY: 392,
    accentColor: '#c59138',
    actionHint: '点击回到宿主管理与系统派令',
  },
  {
    id: 'arena',
    name: '试剑演武台',
    subtitle: '同境切磋交锋、兵器试锋与战力砥砺',
    x: 1248,
    y: 648,
    radius: 135,
    labelX: 1235,
    labelY: 775,
    accentColor: '#b3423d',
    actionHint: '点击选中「擂上首胜」及切磋对手',
  },
  {
    id: 'pass',
    name: '寒鸦山口 · 古道',
    subtitle: '山外险境历练、护身遁符与妖兽采药',
    x: 1320,
    y: 320,
    radius: 120,
    labelX: 1320,
    labelY: 455,
    accentColor: '#7a63a8',
    actionHint: '点击选中「寒鸦岭外试锋」险境任务',
  },
  {
    id: 'spring',
    name: '灵泉静室 · 莲池',
    subtitle: '洞府吐纳养伤、灵丹库藏与法器清点',
    x: 985,
    y: 885,
    radius: 135,
    labelX: 1030,
    labelY: 970,
    accentColor: '#2f8a88',
    actionHint: '点击开启丹库法器百宝格',
  },
];

/** 青石山道主干路节点（保证所有弟子沿石阶与石道自然穿行） */
export const MAP_NODES: Record<string, { x: number; y: number; neighbors: string[] }> = {
  gate_steps: { x: 320, y: 970, neighbors: ['gate_plaza'] },
  gate_plaza: { x: 595, y: 775, neighbors: ['gate_steps', 'south_cross', 'alchemy_yard'] },
  alchemy_yard: { x: 520, y: 550, neighbors: ['gate_plaza', 'heritage_steps', 'bagua_plaza'] },
  heritage_steps: { x: 420, y: 400, neighbors: ['alchemy_yard', 'hall_steps'] },
  hall_steps: { x: 825, y: 525, neighbors: ['heritage_steps', 'bagua_plaza', 'pass_trail'] },
  bagua_plaza: { x: 750, y: 610, neighbors: ['alchemy_yard', 'hall_steps', 'arena_deck', 'spring_bridge', 'south_cross'] },
  south_cross: { x: 645, y: 715, neighbors: ['gate_plaza', 'bagua_plaza', 'spring_bridge'] },
  spring_bridge: { x: 855, y: 845, neighbors: ['south_cross', 'bagua_plaza', 'arena_deck'] },
  arena_deck: { x: 1195, y: 645, neighbors: ['bagua_plaza', 'spring_bridge', 'pass_trail'] },
  pass_trail: { x: 1215, y: 455, neighbors: ['hall_steps', 'arena_deck'] },
};

/** 边路径拐点（key = [a, b].sort().join('--')，保证所有移动沿画中石路或广场折线行进） */
export const MAP_EDGE_VIA: Record<string, Array<{ x: number; y: number }>> = {
  'gate_plaza--gate_steps': [
    { x: 530, y: 845 },
    { x: 455, y: 895 },
  ],
  'alchemy_yard--gate_plaza': [
    { x: 575, y: 535 },
    { x: 635, y: 555 },
    { x: 645, y: 715 },
  ],
  'alchemy_yard--heritage_steps': [
    { x: 565, y: 525 },
    { x: 535, y: 470 },
    { x: 475, y: 425 },
  ],
  'alchemy_yard--bagua_plaza': [
    { x: 575, y: 535 },
    { x: 635, y: 555 },
  ],
  'hall_steps--heritage_steps': [
    { x: 710, y: 540 },
    { x: 580, y: 520 },
    { x: 515, y: 455 },
  ],
  'hall_steps--pass_trail': [
    { x: 965, y: 525 },
    { x: 1110, y: 505 },
    { x: 1190, y: 475 },
  ],
  'arena_deck--bagua_plaza': [
    { x: 1115, y: 615 },
    { x: 975, y: 595 },
  ],
  'bagua_plaza--spring_bridge': [
    { x: 805, y: 715 },
    { x: 830, y: 790 },
  ],
  'south_cross--spring_bridge': [
    { x: 760, y: 735 },
    { x: 805, y: 720 },
    { x: 830, y: 790 },
  ],
  'arena_deck--spring_bridge': [
    { x: 1115, y: 615 },
    { x: 960, y: 605 },
    { x: 810, y: 715 },
    { x: 830, y: 790 },
  ],
  'arena_deck--pass_trail': [
    { x: 1115, y: 615 },
    { x: 980, y: 585 },
    { x: 1020, y: 530 },
    { x: 1125, y: 505 },
  ],
};

export function edgeVia(fromId: string, toId: string): Array<{ x: number; y: number }> {
  const key = [fromId, toId].sort().join('--');
  const pts = MAP_EDGE_VIA[key];
  if (!pts || pts.length === 0) return [];
  return fromId <= toId ? pts : [...pts].reverse();
}

/** 候选人在山门候仙台石阶上的自然站位 */
export const CANDIDATE_STAGE_SLOTS = [
  { x: 235, y: 945 },
  { x: 375, y: 962 },
  { x: 515, y: 945 },
  { x: 655, y: 935 },
];

export function resolveActivityNode(
  kind: string | undefined,
  role: string,
  index: number,
): string {
  if (kind === 'alchemy') return 'alchemy_yard';
  if (kind === 'forging') return 'hall_steps';
  if (kind === 'arena') return 'arena_deck';
  if (kind === 'expedition' || kind === 'beast_expedition') return 'pass_trail';
  if (kind === 'study_method') return 'heritage_steps';
  if (kind === 'recover') return 'spring_bridge';
  if (kind === 'breakthrough') return 'bagua_plaza';
  if (kind === 'idle_cultivate') {
    const idleCycle = ['spring_bridge', 'bagua_plaza', 'hall_steps'];
    return idleCycle[index % idleCycle.length];
  }
  if (role === 'sect_master') return 'hall_steps';
  if (role === 'elder') return index % 2 === 1 ? 'alchemy_yard' : 'gate_plaza';
  const cycle = ['bagua_plaza', 'alchemy_yard', 'arena_deck', 'spring_bridge'];
  return cycle[index % cycle.length];
}
