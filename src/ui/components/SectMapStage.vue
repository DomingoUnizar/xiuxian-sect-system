<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import activityBubbles from '../../content/activity_bubbles.json';
import mapBubbles from '../../content/map_bubbles.json';
import { computeMemberPowerScore } from '../../sim/power';
import type { Candidate, Fact, Member, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolvePortraitUrl, resolveWeaponVisual } from '../visuals/assetRegistry';
import { CANVAS_TOKEN_COLORS, tokenizeRichText } from '../visuals/richText';
import RichText from './RichText.vue';
import SpotlightTheater from './SpotlightTheater.vue';
import {
  ALCHEMY_FURNACE,
  ARENA_CENTER,
  CANDIDATE_STAGE_SLOTS,
  edgeVia,
  MAP_HEIGHT,
  MAP_NODES,
  MAP_WIDTH,
  MAP_ZONES,
  resolveActivityNode,
  type MapZoneId,
} from '../visuals/sectMapSceneData';

interface ActorMotion {
  memberId: string;
  x: number;
  y: number;
  waypoints: Array<{ x: number; y: number }>;
  targetNodeId: string;
  idleTimer: number;
  facing: 1 | -1;
  phase: number;
}

interface FloatingBubble {
  id: string;
  memberId: string | null;
  x: number;
  y: number;
  text: string;
  tone: 'system' | 'alchemy' | 'combat' | 'breakthrough' | 'public';
  ttl: number;
  maxTtl: number;
}

interface FloatingPopup {
  id: string;
  memberId: string | null;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

interface SkyBeamVfx {
  id: string;
  memberId: string | null;
  x: number;
  y: number;
  color: string;
  ttl: number;
  maxTtl: number;
}

interface PetalParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
}

const props = defineProps<{
  systemView: SystemView;
  selectedMemberId: string;
  perspective: 'system' | 'host' | 'public';
  viewHostId: string;
  reducedMotion: boolean;
  recentFacts: Fact[];
  hasInductedNewDisciple: boolean;
  hasIssuedPlayerMission: boolean;
  hasSettledPlayerMission: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-member', memberId: string): void;
  (e: 'zone-action', zoneId: MapZoneId): void;
  (e: 'open-candidate', candidateId: string): void;
  (e: 'open-chronicle'): void;
  (e: 'raid-outpost'): void;
  (e: 'open-perk-draft'): void;
}>();

const stageRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const viewport = reactive({
  width: 960,
  height: 640,
});

const camera = reactive({
  zoom: 1,
  panX: 0,
  panY: 0,
});

const hoveredZoneId = ref<MapZoneId | null>(null);
const hoveredActorId = ref<string | null>(null);

const imgCache = new Map<string, HTMLImageElement>();
const actorMap = new Map<string, ActorMotion>();
const bubbles = ref<FloatingBubble[]>([]);
const popups = ref<FloatingPopup[]>([]);
const skyBeams = ref<SkyBeamVfx[]>([]);
const seenFactIds = new Set<string>();
let lastMinorPopupMs = 0;
const petals: PetalParticle[] = Array.from({ length: 24 }, (_, idx) => ({
  x: ((idx * 173) % MAP_WIDTH),
  y: ((idx * 97) % MAP_HEIGHT),
  vx: 10 + (idx % 5) * 4,
  vy: 14 + (idx % 4) * 5,
  size: 3 + (idx % 3),
  rot: idx * 0.6,
}));

const activeMembers = computed(() =>
  props.systemView.members.filter((m) => m.status === 'active' || m.status === 'injured'),
);

const pendingCandidates = computed(() =>
  props.systemView.recruitment.candidates.filter((c) => c.outcome === 'pending'),
);

const knownEntityNames = computed(() => {
  const names = new Set<string>();
  for (const m of props.systemView.members) names.add(m.name);
  for (const c of props.systemView.recruitment.candidates) names.add(c.name);
  for (const o of props.systemView.arenaOpponents) names.add(o.name);
  for (const b of props.systemView.spiritBeasts ?? []) names.add(b.name);
  if (props.systemView.activePhenomenon?.challenger) names.add(props.systemView.activePhenomenon.challenger.name);
  if (props.systemView.pendingEncounter?.actorName) names.add(props.systemView.pendingEncounter.actorName);
  return Array.from(names);
});

function drawRichCanvasLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  centerX: number,
  y: number,
  isDarkBg: boolean,
  names: readonly string[],
) {
  const segs = tokenizeRichText(line, names);
  const palette = CANVAS_TOKEN_COLORS[isDarkBg ? 'dark' : 'light'];
  const widths = segs.map((s) => {
    ctx.font = s.cls === 'rt-plain' ? '12px "LXGW WenKai", sans-serif' : 'bold 12px "LXGW WenKai", sans-serif';
    return ctx.measureText(s.text).width;
  });
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursorX = centerX - totalW / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  segs.forEach((seg, idx) => {
    ctx.font = seg.cls === 'rt-plain' ? '12px "LXGW WenKai", sans-serif' : 'bold 12px "LXGW WenKai", sans-serif';
    ctx.fillStyle = palette[seg.cls];
    ctx.fillText(seg.text, cursorX, y);
    cursorX += widths[idx];
  });
}

function resolveTickerBadge(f: Fact, isSystemView: boolean): { tone: 'system' | 'combat' | 'alchemy' | 'breakthrough' | 'public'; badgeText: string } {
  if (isSystemView && f.visibility !== 'public') return { tone: 'system', badgeText: '密令' };
  if (f.type === 'member.breakthrough' || f.type === 'heritage.achieved') {
    return { tone: 'breakthrough', badgeText: '突破' };
  }
  if (f.type === 'battle.finished') return { tone: 'combat', badgeText: '战报' };
  if (f.type === 'alchemy.finished' || f.type === 'forging.finished') {
    return { tone: 'alchemy', badgeText: '百艺' };
  }
  return { tone: 'public', badgeText: '山门' };
}

const visibleTickerFacts = computed(() => {
  const raw = props.systemView.facts.slice(-18).reverse();
  const list: Array<{
    id: string;
    text: string;
    tone: 'system' | 'combat' | 'alchemy' | 'breakthrough' | 'public';
    badgeText: string;
  }> = [];
  for (const f of raw) {
    if (props.perspective === 'public') {
      if (f.visibility === 'public' && f.publicSummary) {
        list.push({ id: f.id, text: f.publicSummary, ...resolveTickerBadge(f, false) });
      }
    } else if (props.perspective === 'host') {
      if (f.visibility === 'host_private' && f.recipientId === props.viewHostId && f.privateSummary) {
        list.push({ id: f.id, text: f.privateSummary, tone: 'system', badgeText: '密令' });
      } else if (f.visibility === 'public' && f.publicSummary) {
        list.push({ id: f.id, text: f.publicSummary, ...resolveTickerBadge(f, false) });
      }
    } else {
      list.push({
        id: f.id,
        text: f.systemSummary,
        ...resolveTickerBadge(f, f.visibility !== 'public'),
      });
    }
    if (list.length >= 1) break;
  }
  return list;
});

function getImage(relPath: string): HTMLImageElement | null {
  const url = assetUrl(relPath);
  const existing = imgCache.get(url);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  const img = new Image();
  img.src = url;
  imgCache.set(url, img);
  return null;
}

function findNodePath(fromId: string, toId: string): string[] {
  if (fromId === toId) return [toId];
  const queue: string[][] = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const tail = path[path.length - 1];
    const node = MAP_NODES[tail];
    if (!node) continue;
    for (const nextId of node.neighbors) {
      if (nextId === toId) return [...path, nextId];
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push([...path, nextId]);
      }
    }
  }
  return [toId];
}

function nearestNodeId(x: number, y: number): string {
  let bestId = 'bagua_plaza';
  let bestDist = Infinity;
  for (const [id, node] of Object.entries(MAP_NODES)) {
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function assignRoute(actor: ActorMotion, targetNodeId: string, offsetX = 0, offsetY = 0) {
  const startNodeId = nearestNodeId(actor.x, actor.y);
  const nodeIds = findNodePath(startNodeId, targetNodeId);
  actor.targetNodeId = targetNodeId;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    const nid = nodeIds[i];
    if (i > 0) {
      pts.push(...edgeVia(nodeIds[i - 1], nid));
    }
    const n = MAP_NODES[nid];
    if (i === nodeIds.length - 1) {
      pts.push({ x: n.x + offsetX, y: n.y + offsetY });
    } else {
      pts.push({ x: n.x, y: n.y });
    }
  }
  actor.waypoints = pts;
}

function syncActorsWithMembers() {
  const keepIds = new Set(activeMembers.value.map((m) => m.id));
  for (const id of actorMap.keys()) {
    if (!keepIds.has(id)) actorMap.delete(id);
  }
  activeMembers.value.forEach((m, idx) => {
    const targetNode = resolveActivityNode(m.currentActivity?.kind, m.role, idx);
    const angle = (idx * 2.15) % (Math.PI * 2);
    const radius = m.currentActivity ? 26 : 36;
    const ox = Math.cos(angle) * radius;
    const oy = Math.sin(angle) * radius * 0.6;
    let actor = actorMap.get(m.id);
    if (!actor) {
      const n = MAP_NODES[targetNode] ?? MAP_NODES.bagua_plaza;
      actor = {
        memberId: m.id,
        x: n.x + ox,
        y: n.y + oy,
        waypoints: [],
        targetNodeId: targetNode,
        idleTimer: 3 + (idx % 4) * 1.5,
        facing: idx % 2 === 0 ? 1 : -1,
        phase: idx * 1.3,
      };
      actorMap.set(m.id, actor);
    } else if (m.currentActivity && actor.targetNodeId !== targetNode) {
      assignRoute(actor, targetNode, ox, oy);
    }
  });
}

function summarizeCleanShortSentence(rawText: string): string {
  const clean = rawText.trim();
  if (clean.length <= 28) return clean;
  let parenDepth = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '（' || ch === '(') parenDepth += 1;
    else if ((ch === '）' || ch === ')') && parenDepth > 0) parenDepth -= 1;
    else if (parenDepth === 0 && i >= 10 && '。！？；'.includes(ch)) {
      return clean.slice(0, i + 1);
    }
  }
  parenDepth = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '（' || ch === '(') parenDepth += 1;
    else if ((ch === '）' || ch === ')') && parenDepth > 0) parenDepth -= 1;
    else if (parenDepth === 0 && i >= 10 && '，、'.includes(ch)) {
      return `${clean.slice(0, i)}。`;
    }
  }
  return clean;
}

function formatFactBubble(f: Fact): { text: string; tone: FloatingBubble['tone'] } | null {
  // 严格遵守当前观察视角隐私规则，不在公开视角下在地图冒出系统秘密词
  let tone: FloatingBubble['tone'] = 'public';
  let rawText = '';

  if (props.perspective === 'public') {
    if (f.visibility !== 'public' || !f.publicSummary) return null;
    rawText = f.publicSummary;
    tone = 'public';
  } else if (props.perspective === 'host') {
    if (f.visibility === 'host_private' && f.recipientId === props.viewHostId && f.privateSummary) {
      rawText = f.privateSummary;
      tone = 'system';
    } else if (f.visibility === 'public' && f.publicSummary) {
      rawText = f.publicSummary;
      tone = 'public';
    } else {
      return null;
    }
  } else {
    rawText = f.privateSummary ?? f.publicSummary ?? f.systemSummary;
    tone =
      f.type === 'alchemy.finished'
        ? 'alchemy'
        : f.type === 'battle.finished'
          ? 'combat'
          : f.visibility === 'public'
            ? 'public'
            : 'system';
  }

  if (!rawText) return null;

  // 常规事务与日常吐纳不抢气泡位，仅在关键节点与趣味时刻冒出 1 条
  if (f.type === 'mission.issued' || f.type === 'mission.accepted' || f.type === 'herb.gathered') {
    return null;
  }

  // 非公开系统/宿主视角的专有提示短句
  if (f.visibility !== 'public') {
    if (f.type === 'mission.declined') return { text: '眼下力有未逮，这桩差事暂且推却。', tone: 'system' };
    if (f.type === 'reward.granted') {
      if (f.systemSummary.includes('气运暴击')) {
        return { text: '气运暴击返还触发，修为道源齐暴涨！', tone: 'breakthrough' };
      }
      return f.cueTier === 'major' ? { text: '密令大成，澎湃灵力贯体！', tone: 'system' } : null;
    }
    if (f.type === 'hidden_reward.triggered') return { text: '暗藏机缘应验，额外造化入体！', tone: 'breakthrough' };
    if (f.type === 'ability.granted') {
      return {
        text: f.systemSummary.includes('逆天洗髓') ? '逆天洗髓功成，灵根已升品蜕变！' : '护道神通已入体，根基永固！',
        tone: 'breakthrough',
      };
    }
  }

  if (f.type === 'alchemy.finished') {
    const alc = f.alchemyFactId ? props.systemView.alchemyFacts[f.alchemyFactId] : undefined;
    const ok = alc ? alc.success : rawText.includes('成丹');
    return ok ? { text: '炉火温顺，这一炉灵丹成了！', tone: 'alchemy' } : null;
  }
  if (f.type === 'forging.finished') {
    if (f.visibility !== 'public' && f.systemSummary.includes('天道赐器')) {
      return { text: '神兵主动择主，战力倍增！', tone: 'breakthrough' };
    }
    return { text: '器堂水火交融，新铸法器出炉！', tone: 'alchemy' };
  }
  if (f.type === 'beast.expedition') {
    return { text: '灵兽循铃归来，带回山泽灵材！', tone: 'public' };
  }
  if (f.type === 'battle.finished') {
    if (f.publicSummary?.includes('【山门大捷】')) {
      return { text: '出征大捷，神兵宝药满载归宗！', tone: 'combat' };
    }
    if (f.publicSummary?.includes('大比决赛落幕')) {
      return { text: '大比决赛落幕，切磋剑势精进！', tone: 'combat' };
    }
    const bat = f.battleFactId ? props.systemView.battleFacts[f.battleFactId] : undefined;
    const won = bat
      ? bat.outcome === 'crushing_win' || bat.outcome === 'win' || bat.outcome === 'close_win'
      : rawText.includes('胜');
    return won ? { text: '试剑交锋得胜，剑势更凝三分！', tone: 'combat' } : null;
  }
  if (f.type === 'tournament.opened') {
    return { text: '宗门论剑大比开启，整装待发！', tone: 'combat' };
  }
  if (f.type === 'tournament.breakthrough') {
    return { text: '临阵冲关顺遂，修为再上一层！', tone: 'breakthrough' };
  }
  if (f.type === 'heritage.achieved') {
    return { text: '本门秘法薪火相传，道统生辉！', tone: 'breakthrough' };
  }
  if (f.type === 'member.breakthrough') {
    const ok = f.publicSummary?.includes('晋入');
    return {
      text: ok ? '一举破开壁垒，踏入全新大境！' : '冲关暂歇调息，蓄势再叩大关。',
      tone: ok ? 'breakthrough' : 'public',
    };
  }
  if (f.type === 'world.phenomenon') {
    return { text: '山门天地异象显现，正可趁势而为！', tone: 'breakthrough' };
  }
  if (f.type === 'member.joined') {
    return { text: '正式拜入青蘅山门，潜心向道！', tone: 'public' };
  }

  if (f.type === 'cultivation.progressed') {
    const summaryText = f.publicSummary ?? f.systemSummary;
    if (summaryText.includes('万剑齐鸣')) {
      return { text: '万剑齐鸣金莲降，百脉齐通修为暴涨！', tone: 'breakthrough' };
    }
    if (summaryText.includes('九层圆满')) {
      return { text: '灵台顿开，修为直抵九层圆满！', tone: 'breakthrough' };
    }
    if (summaryText.includes('脱胎换骨')) {
      return { text: '清霞贯体洗髓伐毛，灵韵倍增！', tone: 'breakthrough' };
    }
    return null;
  }
  return { text: summarizeCleanShortSentence(rawText), tone };
}

function buildPopupForFact(f: Fact): { text: string; color: string; beamColor?: string } | null {
  if (props.perspective === 'public' && f.visibility !== 'public') return null;
  if (props.perspective === 'host' && f.visibility === 'host_private' && f.recipientId !== props.viewHostId) {
    return null;
  }
  if (f.systemSummary.includes('护山危局大捷')) {
    return { text: '🏆 护山大捷!', color: '#ffd43b', beamColor: '#ffcf4d' };
  }
  if (f.systemSummary.includes('双头拱火名场面') && props.perspective !== 'public') {
    return { text: '🎭 双头拱火!', color: '#d0a2ff', beamColor: '#b782ff' };
  }
  if (f.systemSummary.includes('虎狼猛药赌赢') && props.perspective !== 'public') {
    return { text: '🔥 猛药爆冲!', color: '#ff8a5b', beamColor: '#ff6e42' };
  }
  if (f.systemSummary.includes('私令兑现·雪中送炭') && props.perspective !== 'public') {
    return { text: '🌱 暗中点化!', color: '#6df2b8', beamColor: '#4be3a4' };
  }
  if (f.systemSummary.includes('万剑归宗')) {
    return { text: '👑 万剑归宗!', color: '#ffd43b', beamColor: '#f7c948' };
  }
  const critMatch = f.systemSummary.match(/×(\d+)\s*倍气运暴击/);
  if (critMatch && props.perspective !== 'public') {
    return { text: `💥 ×${critMatch[1]}暴击!`, color: '#ff66b3', beamColor: '#ff66b3' };
  }
  if (f.type === 'ability.granted' && f.systemSummary.includes('逆天洗髓') && props.perspective !== 'public') {
    return { text: '🧬 灵根升品!', color: '#38e8c6', beamColor: '#38e8c6' };
  }
  if (f.type === 'forging.finished' && f.systemSummary.includes('天道赐器') && props.perspective !== 'public') {
    return { text: '🗡️ 赐器!', color: '#c099ff', beamColor: '#b78eff' };
  }
  if (f.type === 'forging.finished' && f.systemSummary.includes('淬兵强化')) {
    return { text: '⚒️ 强化!', color: '#ffa94d', beamColor: '#f0b65a' };
  }
  if (f.type === 'forging.finished' && f.systemSummary.includes('天机盲盒')) {
    return { text: '🔮 爆器!', color: '#ffa94d', beamColor: '#ffd25a' };
  }
  if (f.type === 'ability.granted' && f.systemSummary.includes('师徒传功') && props.perspective !== 'public') {
    return { text: '🎓 传功!', color: '#38e8c6', beamColor: '#38e8c6' };
  }
  if (f.type === 'heritage.achieved' && f.details?.includes('【抉择】')) {
    return { text: '📜 奇遇!', color: '#c099ff', beamColor: '#c099ff' };
  }
  if (f.type === 'world.phenomenon' && f.systemSummary.includes('福地升阶')) {
    return { text: '🏛️ 福地晋升!', color: '#38e8c6', beamColor: '#5ce0b0' };
  }
  if (f.type === 'battle.finished' && (f.publicSummary?.includes('【山门大捷】') || f.systemSummary.includes('征伐大捷'))) {
    return { text: '🏆 大捷!', color: '#ff6b57', beamColor: '#ff6b57' };
  }
  if (f.type === 'member.breakthrough' && f.publicSummary?.includes('晋入')) {
    return { text: '⚡ 破境!', color: '#ffd43b', beamColor: '#ffda66' };
  }
  if (f.type === 'cultivation.progressed' && f.publicSummary?.includes('修至')) {
    return { text: '⚡ 圆满!', color: '#ffd43b', beamColor: '#f5c749' };
  }
  if (f.type === 'cultivation.progressed' && f.publicSummary?.includes('破入')) {
    return { text: '+1层', color: '#38e8c6' };
  }
  if (f.visibility !== 'public' && props.perspective !== 'public') {
    if (f.type === 'hidden_reward.triggered') {
      return { text: '🌟 机缘!', color: '#c099ff', beamColor: '#c099ff' };
    }
  }
  if (f.type === 'alchemy.finished') {
    const alc = f.alchemyFactId ? props.systemView.alchemyFacts[f.alchemyFactId] : undefined;
    if (alc?.success) return { text: '💊 成丹!', color: '#ffa94d' };
  }
  if (f.type === 'battle.finished') {
    const bat = f.battleFactId ? props.systemView.battleFacts[f.battleFactId] : undefined;
    if (bat && (bat.outcome === 'crushing_win' || bat.outcome === 'win' || bat.outcome === 'close_win')) {
      return { text: '⚔️ 胜!', color: '#ff6b57' };
    }
  }
  if (f.type === 'forging.finished') {
    return { text: '⚒️ 新器!', color: '#ffa94d' };
  }
  return null;
}

function spawnBubbleFromFact(f: Fact) {
  if (seenFactIds.has(f.id)) return;
  seenFactIds.add(f.id);

  const memberId = f.recipientId ?? f.actorIds[0] ?? null;
  const actor = memberId ? actorMap.get(memberId) : null;
  const x = actor?.x ?? 800;
  const y = actor?.y ?? 420;
  const nowMs = Date.now();

  const pop = buildPopupForFact(f);
  if (pop) {
    const isMajor = Boolean(pop.beamColor);
    if (isMajor || nowMs - lastMinorPopupMs >= 2200) {
      if (!isMajor) lastMinorPopupMs = nowMs;
      popups.value = [
        ...popups.value.filter((p) => !memberId || p.memberId !== memberId).slice(-1),
        {
          id: `pop-${f.id}-${nowMs}`,
          memberId,
          x,
          y,
          text: pop.text,
          color: pop.color,
          ttl: 1.5,
          maxTtl: 1.5,
        },
      ];
    }
    if (pop.beamColor && !props.reducedMotion) {
      const targets = f.systemSummary.includes('万剑归宗')
        ? activeMembers.value.map((m) => m.id)
        : f.systemSummary.includes('双头拱火名场面') && f.actorIds.length > 1
          ? f.actorIds
          : [memberId];
      for (const tid of targets) {
        const ta = tid ? actorMap.get(tid) : null;
        skyBeams.value.push({
          id: `beam-${f.id}-${tid ?? 'x'}-${nowMs}`,
          memberId: tid,
          x: ta?.x ?? x,
          y: ta?.y ?? y,
          color: pop.beamColor,
          ttl: 1.45,
          maxTtl: 1.45,
        });
      }
      if (skyBeams.value.length > 8) {
        skyBeams.value = skyBeams.value.slice(-8);
      }
    }
  }

  const formatted = formatFactBubble(f);
  if (!formatted) return;

  // 地图同屏最多 1 条气泡，避免一串气泡满屏乱跳
  if (bubbles.value.length >= 1 && formatted.tone !== 'breakthrough' && formatted.tone !== 'combat') {
    return;
  }

  bubbles.value = [
    {
      id: `${f.id}-${nowMs}`,
      memberId,
      x,
      y,
      text: formatted.text,
      tone: formatted.tone,
      ttl: 3.2,
      maxTtl: 3.2,
    },
  ];
}

watch(
  () => props.systemView.members,
  () => syncActorsWithMembers(),
  { deep: true, immediate: true },
);

watch(
  () => props.recentFacts,
  (facts) => {
    for (const f of facts.slice(-6)) {
      spawnBubbleFromFact(f);
    }
  },
  { deep: true },
);

// 计算铺满视口（cover）缩放、全景缩放下限与拖拽边界，保证缩放可控且默认不露底色
function getTransformParams() {
  const cw = Math.max(320, viewport.width);
  const ch = Math.max(240, viewport.height);
  const coverScale = Math.max(cw / MAP_WIDTH, ch / MAP_HEIGHT);
  const containScale = Math.min(cw / MAP_WIDTH, ch / MAP_HEIGHT);
  const minZoom = Math.min(1, containScale / coverScale);
  const effectiveZoom = Math.max(minZoom, Math.min(1.8, camera.zoom));
  const scale = coverScale * effectiveZoom;
  const maxPanX = Math.max(0, (MAP_WIDTH * scale - cw) / 2);
  const maxPanY = Math.max(0, (MAP_HEIGHT * scale - ch) / 2);
  const panX = Math.max(-maxPanX, Math.min(maxPanX, camera.panX));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, camera.panY));
  const cx = cw / 2 + panX;
  const cy = ch / 2 + panY;
  return { scale, cx, cy, cw, ch, maxPanX, maxPanY, panX, panY, minZoom };
}

function getUiScale(scale = getTransformParams().scale) {
  const compact = viewport.width < 720;
  const uiFloor = compact ? 0.85 : 0.95;
  const k = Math.max(1, uiFloor / scale);
  return { k, compact, uiFloor };
}

function withUi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  draw: () => void,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  draw();
  ctx.restore();
}

function clampCameraPan() {
  const { panX, panY } = getTransformParams();
  camera.panX = panX;
  camera.panY = panY;
}

function worldToScreen(wx: number, wy: number) {
  const { scale, cx, cy } = getTransformParams();
  return {
    x: cx + (wx - MAP_WIDTH / 2) * scale,
    y: cy + (wy - MAP_HEIGHT / 2) * scale,
    scale,
  };
}

function screenToWorld(sx: number, sy: number) {
  const { scale, cx, cy } = getTransformParams();
  return {
    x: (sx - cx) / scale + MAP_WIDTH / 2,
    y: (sy - cy) / scale + MAP_HEIGHT / 2,
  };
}

function adjustZoom(delta: number) {
  const { minZoom } = getTransformParams();
  camera.zoom = Math.max(minZoom, Math.min(1.8, Number((camera.zoom + delta).toFixed(2))));
  clampCameraPan();
}

function resetCamera() {
  camera.zoom = 1;
  camera.panX = 0;
  camera.panY = 0;
}

const actorScreenPositions = ref<
  Array<{ id: string; name: string; x: number; y: number; activeKind?: string }>
>([]);

function refreshActorScreenPositions() {
  actorScreenPositions.value = activeMembers.value.map((m) => {
    const actor = actorMap.get(m.id);
    const pos = worldToScreen(actor?.x ?? 800, actor?.y ?? 520);
    return {
      id: m.id,
      name: m.name,
      x: pos.x,
      y: pos.y,
      activeKind: m.currentActivity?.kind,
    };
  });
}

const zoneScreenPositions = computed(() =>
  MAP_ZONES.map((z) => {
    const pos = worldToScreen(z.x, z.y);
    return {
      ...z,
      sx: pos.x,
      sy: pos.y,
    };
  }),
);

const passZonePos = computed(() => zoneScreenPositions.value.find((z) => z.id === 'pass') ?? null);
const hallZonePos = computed(() => zoneScreenPositions.value.find((z) => z.id === 'hall') ?? null);

// --- Pointer Drag / Pan / Click Interaction ---
let dragState: {
  active: boolean;
  startX: number;
  startY: number;
  origPanX: number;
  origPanY: number;
  moved: number;
} | null = null;

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  dragState = {
    active: true,
    startX: e.clientX,
    startY: e.clientY,
    origPanX: camera.panX,
    origPanY: camera.panY,
    moved: 0,
  };
}

function onPointerMove(e: PointerEvent) {
  if (dragState?.active) {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.moved = Math.hypot(dx, dy);
    if (dragState.moved > 4) {
      const { maxPanX, maxPanY } = getTransformParams();
      camera.panX = Math.max(-maxPanX, Math.min(maxPanX, dragState.origPanX + dx));
      camera.panY = Math.max(-maxPanY, Math.min(maxPanY, dragState.origPanY + dy));
    }
    return;
  }
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const { k } = getUiScale();
  let foundActor: string | null = null;
  for (const actor of actorMap.values()) {
    if (Math.hypot(actor.x - w.x, actor.y - w.y) <= 36 * k) {
      foundActor = actor.memberId;
      break;
    }
  }
  hoveredActorId.value = foundActor;
  if (!foundActor) {
    let foundZone: MapZoneId | null = null;
    for (const z of MAP_ZONES) {
      if (Math.hypot(z.x - w.x, z.y - w.y) <= z.radius * 0.92) {
        foundZone = z.id;
        break;
      }
    }
    hoveredZoneId.value = foundZone;
  } else {
    hoveredZoneId.value = null;
  }
}

function onPointerUp(e: PointerEvent) {
  if (!dragState) return;
  const wasClick = dragState.moved <= 6;
  dragState = null;
  if (!wasClick) return;
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const { k } = getUiScale();
  // 1. 先判定弟子令牌
  for (const actor of actorMap.values()) {
    if (Math.hypot(actor.x - w.x, actor.y - w.y) <= 40 * k) {
      emit('select-member', actor.memberId);
      return;
    }
  }
  // 2. 判定山门候考候选人
  for (let i = 0; i < pendingCandidates.value.length && i < CANDIDATE_STAGE_SLOTS.length; i += 1) {
    const slot = CANDIDATE_STAGE_SLOTS[i];
    if (Math.hypot(slot.x - w.x, slot.y - w.y) <= 34 * k) {
      emit('open-candidate', pendingCandidates.value[i].id);
      return;
    }
  }
  // 3. 判定七大宗门建筑区
  for (const z of MAP_ZONES) {
    if (Math.hypot(z.x - w.x, z.y - w.y) <= z.radius) {
      emit('zone-action', z.id);
      return;
    }
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  adjustZoom(e.deltaY < 0 ? 0.1 : -0.1);
}

// --- Canvas2D Scene Helpers ---
const ZONE_ACTIVE_KINDS: Partial<Record<MapZoneId, string[]>> = {
  alchemy: ['alchemy'],
  heritage: ['study_method'],
  arena: ['arena'],
  pass: ['expedition'],
  spring: ['recover'],
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(228, 189, 109, ${alpha})`;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  relPath: string,
  ringColor: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f5eedc';
  ctx.fill();
  const img = getImage(relPath);
  if (img) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

function renderScene(timeSec: number) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(viewport.width * dpr);
  const targetH = Math.round(viewport.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Full viewport misty celadon sky backdrop behind scaled canvas
  const skyBg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyBg.addColorStop(0, '#cbe2d9');
  skyBg.addColorStop(0.45, '#e7f1e6');
  skyBg.addColorStop(1, '#9cc2af');
  ctx.fillStyle = skyBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { scale, cx, cy } = getTransformParams();
  const { k, compact } = getUiScale(scale);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, cx * dpr, cy * dpr);
  ctx.translate(-MAP_WIDTH / 2, -MAP_HEIGHT / 2);

  const sway = props.reducedMotion ? 0 : Math.sin(timeSec * 1.4) * 2.2;

  // 1. Hand-painted Sect Mountain Backdrop Illustration
  const mapImg = getImage('assets/scenes/sect_map_qingheng.webp');
  if (mapImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapImg, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  // 2. Zone Radial Aura (hover or active activity) + Activity FX + Permanent Plaques
  const activeKinds = new Set<string>(
    activeMembers.value.map((m) => m.currentActivity?.kind).filter((k): k is NonNullable<typeof k> => Boolean(k)),
  );
  const pulse = 0.55 + Math.sin(timeSec * 3.2) * 0.35;

  // Upgraded Spirit Vein ambient golden-jade Bagua glow
  const veinLv = props.systemView.sectSpiritVeinLevel ?? 1;
  if (veinLv >= 2) {
    ctx.save();
    const vr = 180 + veinLv * 55 + (props.reducedMotion ? 0 : pulse * 24);
    const vGrad = ctx.createRadialGradient(750, 610, 20, 750, 610, vr);
    vGrad.addColorStop(0, `rgba(116, 232, 188, ${0.08 + veinLv * 0.03})`);
    vGrad.addColorStop(0.55, `rgba(232, 194, 102, ${0.05 + veinLv * 0.02})`);
    vGrad.addColorStop(1, 'rgba(116, 232, 188, 0)');
    ctx.fillStyle = vGrad;
    ctx.beginPath();
    ctx.arc(750, 610, vr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const z of MAP_ZONES) {
    const isHovered = hoveredZoneId.value === z.id;
    const isZoneActive = Boolean(ZONE_ACTIVE_KINDS[z.id]?.some((k) => activeKinds.has(k)));
    if (isHovered || isZoneActive) {
      ctx.save();
      const aura = ctx.createRadialGradient(z.x, z.y, 12, z.x, z.y, z.radius);
      aura.addColorStop(0, hexToRgba(z.accentColor, isHovered ? 0.34 : 0.24));
      aura.addColorStop(0.65, hexToRgba(z.accentColor, 0.12));
      aura.addColorStop(1, hexToRgba(z.accentColor, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Alchemy cauldron fire aura at painted bronze furnace
  if (activeKinds.has('alchemy') || !props.reducedMotion) {
    ctx.save();
    const glowR = activeKinds.has('alchemy') ? 32 + pulse * 12 : 16;
    const fg = ctx.createRadialGradient(
      ALCHEMY_FURNACE.x,
      ALCHEMY_FURNACE.y - 6,
      2,
      ALCHEMY_FURNACE.x,
      ALCHEMY_FURNACE.y - 6,
      glowR,
    );
    fg.addColorStop(0, activeKinds.has('alchemy') ? 'rgba(255, 194, 72, 0.92)' : 'rgba(235, 160, 72, 0.42)');
    fg.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(ALCHEMY_FURNACE.x, ALCHEMY_FURNACE.y - 6, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Arena sword-duel arc at painted sword platform
  if (activeKinds.has('arena')) {
    ctx.save();
    ctx.strokeStyle = `rgba(98, 224, 212, ${0.45 + pulse * 0.45})`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(ARENA_CENTER.x, ARENA_CENTER.y, 44, -0.9 + sway * 0.1, 0.8 + sway * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  // Active Mountain Phenomenon Atmospheric VFX
  const phenom = props.systemView.activePhenomenon;
  if (phenom) {
    ctx.save();
    if (phenom.kind === 'spirit_tide') {
      const grad = ctx.createRadialGradient(780, 620, 40, 780, 620, 440);
      grad.addColorStop(0, `rgba(94, 224, 196, ${0.14 + pulse * 0.1})`);
      grad.addColorStop(1, 'rgba(94, 224, 196, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(780, 620, 440, 0, Math.PI * 2);
      ctx.fill();
    } else if (phenom.kind === 'earth_fire_surge') {
      const fg = ctx.createRadialGradient(ALCHEMY_FURNACE.x, ALCHEMY_FURNACE.y, 8, ALCHEMY_FURNACE.x, ALCHEMY_FURNACE.y, 96);
      fg.addColorStop(0, `rgba(255, 165, 64, ${0.32 + pulse * 0.16})`);
      fg.addColorStop(1, 'rgba(255, 110, 32, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(ALCHEMY_FURNACE.x, ALCHEMY_FURNACE.y, 96, 0, Math.PI * 2);
      ctx.fill();
    } else if (phenom.kind === 'challenger_at_gate') {
      ctx.strokeStyle = `rgba(218, 72, 62, ${0.42 + pulse * 0.36})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(465, 845, 76 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (phenom.kind === 'spring_mist_bloom') {
      const mg = ctx.createRadialGradient(985, 885, 18, 985, 885, 160);
      mg.addColorStop(0, `rgba(212, 245, 240, ${0.28 + pulse * 0.14})`);
      mg.addColorStop(1, 'rgba(212, 245, 240, 0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(985, 885, 160, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Permanent Landmark Plaques below each building footprint (color-coded by zone accent)
  for (const z of MAP_ZONES) {
    const isHovered = hoveredZoneId.value === z.id;
    const plaqueText = z.name.split(' · ')[0];
    withUi(ctx, z.labelX, z.labelY, k, () => {
      ctx.font = 'bold 14px "LXGW WenKai", serif';
      const pw = Math.max(96, ctx.measureText(plaqueText).width + 32);
      const ph = 25;
      ctx.fillStyle = isHovered ? 'rgba(18, 42, 39, 0.96)' : 'rgba(13, 30, 29, 0.9)';
      ctx.strokeStyle = z.accentColor;
      ctx.lineWidth = isHovered ? 2.4 : 1.7;
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 13);
      ctx.fill();
      ctx.stroke();

      // Colored landmark jewel dot
      ctx.fillStyle = z.accentColor;
      ctx.beginPath();
      ctx.arc(-pw / 2 + 12, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isHovered ? '#ffffff' : '#f4ead2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(plaqueText, 5, 0.5);
    });
  }

  // 8. Pending Recruitment Candidates on Gate Steps (stationary nameplates)
  pendingCandidates.value.forEach((cand: Candidate, idx: number) => {
    const slot = CANDIDATE_STAGE_SLOTS[idx];
    if (!slot) return;
    const bob = props.reducedMotion ? 0 : Math.sin(timeSec * 2.2 + idx) * 1.4;
    withUi(ctx, slot.x, slot.y, k, () => {
      drawRoundedPortrait(
        ctx,
        0,
        bob,
        19,
        resolvePortraitUrl(cand.portraitId),
        cand.auditioned ? '#e4bd6d' : '#58a88c',
      );
      if (!compact) {
        ctx.fillStyle = 'rgba(252, 249, 240, 0.95)';
        ctx.strokeStyle = cand.auditioned ? '#d49a38' : '#56a489';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-38, 22, 76, 18, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a2c29';
        ctx.font = 'bold 11px "LXGW WenKai", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`候·${cand.name}`, 0, 31);
      }
    });
  });

  // 9. ActiveSect Members Walking & Performing Real Tasks (nameplates & shadows stationary, subtle walk bob on portrait only)
  const ACTIVITY_DOT_COLORS: Record<string, string> = {
    alchemy: '#ff9f43',
    forging: '#ffa94d',
    arena: '#ff6b57',
    expedition: '#ff5252',
    breakthrough: '#ffd43b',
    study_method: '#4dabf7',
    beast_expedition: '#4dabf7',
    recover: '#51cf66',
    idle_cultivate: '#38d9a9',
  };
  const sortedActors = activeMembers.value
    .map((m) => ({ member: m, actor: actorMap.get(m.id) }))
    .filter((pair): pair is { member: Member; actor: ActorMotion } => Boolean(pair.actor))
    .sort((a, b) => a.actor.y - b.actor.y);

  for (const { member, actor } of sortedActors) {
    const isSelected = member.id === props.selectedMemberId;
    const isHover = member.id === hoveredActorId.value;
    const isWalking = actor.waypoints.length > 0;
    const bob = !isWalking || props.reducedMotion ? 0 : Math.sin(timeSec * 3.0 + actor.phase) * 1.6;

    withUi(ctx, actor.x, actor.y, k, () => {
      // Ground shadow (strictly stationary)
      ctx.fillStyle = 'rgba(18, 42, 36, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Selected golden Bagua ring
      if (isSelected || isHover) {
        ctx.save();
        ctx.strokeStyle = isSelected ? '#e4bd6d' : '#6fd3b2';
        ctx.lineWidth = isSelected ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.ellipse(0, 20, 29, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Mini Cultivation/Activity Progress Halo around portrait
      if (member.currentActivity) {
        const total = Math.max(1, member.currentActivity.resolveAtTick - member.currentActivity.startedTick);
        const prog = Math.max(0.08, Math.min(1, (props.systemView.tick - member.currentActivity.startedTick) / total));
        ctx.save();
        ctx.strokeStyle = ACTIVITY_DOT_COLORS[member.currentActivity.kind] ?? '#4bc0a5';
        ctx.lineWidth = member.currentActivity.kind === 'breakthrough' ? 4.5 : 3.5;
        ctx.beginPath();
        ctx.arc(0, -6 + bob, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.restore();
      }

      // Portrait token (portrait bobs slightly only while walking)
      const rim =
        member.role === 'sect_master'
          ? '#e4bd6d'
          : member.role === 'elder'
            ? '#75c4ad'
            : '#fcf9f0';
      drawRoundedPortrait(ctx, 0, -6 + bob, 22, resolvePortraitUrl(member.portraitId), rim);

      // Equipped/assigned tiny weapon badge on right shoulder
      const wpn = resolveWeaponVisual(member);
      const wpnImg = getImage(wpn.iconPath);
      if (wpnImg) {
        ctx.drawImage(wpnImg, 12, -4 + bob, 18, 18);
      }

      // Stationary Parchment Nameplate with color-coded activity dot
      if (!compact || isSelected || isHover) {
        ctx.fillStyle = isSelected ? '#173832' : 'rgba(252, 249, 240, 0.96)';
        ctx.strokeStyle = isSelected ? '#e4bd6d' : '#b79c63';
        ctx.lineWidth = 1.6;
        const activityLabels: Record<string, string> = {
          alchemy: '炼丹',
          forging: '炼器',
          arena: '试剑',
          beast_expedition: '探泉',
          expedition: '历练',
          recover: '疗伤',
          study_method: '悟法',
          breakthrough: '冲关',
          idle_cultivate: '修行',
        };
        const showActivity = isSelected || isHover;
        const tagText = showActivity
          ? member.currentActivity
            ? `${member.name} · ${activityLabels[member.currentActivity.kind] ?? '修行'}`
            : `${member.name} · ${member.realm}${member.realmLayer}`
          : member.name;
        ctx.font = 'bold 12px "LXGW WenKai", sans-serif';
        const dotPad = member.currentActivity ? 12 : 0;
        const textW = Math.max(58, ctx.measureText(tagText).width + 16 + dotPad);
        ctx.beginPath();
        ctx.roundRect(-textW / 2, 21, textW, 20, 10);
        ctx.fill();
        ctx.stroke();

        if (member.currentActivity) {
          ctx.fillStyle = ACTIVITY_DOT_COLORS[member.currentActivity.kind] ?? '#38d9a9';
          ctx.beginPath();
          ctx.arc(-textW / 2 + 11, 31, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }

        if (showActivity) {
          const suffix = member.currentActivity
            ? ` · ${activityLabels[member.currentActivity.kind] ?? '修行'}`
            : ` · ${member.realm}${member.realmLayer}`;
          const nameW = ctx.measureText(member.name).width;
          const suffixW = ctx.measureText(suffix).width;
          const totalW = nameW + suffixW;
          const startX = dotPad / 2 - totalW / 2;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isSelected ? '#9fd8ff' : '#144fa6';
          ctx.fillText(member.name, startX, 31);
          ctx.fillStyle = member.currentActivity
            ? ACTIVITY_DOT_COLORS[member.currentActivity.kind] ?? (isSelected ? '#ffd970' : '#0b705c')
            : isSelected
              ? '#ffe07d'
              : '#5636bf';
          ctx.fillText(suffix, startX + nameW, 31);
        } else {
          ctx.fillStyle = isSelected ? '#9fd8ff' : '#1a2c29';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tagText, dotPad / 2, 31);
        }
      }
    });
  }

  // 10. Drifting Peach Petals
  if (!props.reducedMotion) {
    ctx.save();
    for (const p of petals) {
      ctx.fillStyle = 'rgba(247, 198, 212, 0.78)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, p.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Dev-only alignment overlay (?mapDebug=1)
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('mapDebug')) {
    ctx.save();
    // Road graph edges (with edgeVia waypoints) & nodes
    ctx.strokeStyle = 'rgba(0, 215, 255, 0.85)';
    ctx.lineWidth = 3;
    const seen = new Set<string>();
    const viaPoints: Array<{ x: number; y: number }> = [];
    for (const [aId, nodeA] of Object.entries(MAP_NODES)) {
      for (const bId of nodeA.neighbors) {
        const key = [aId, bId].sort().join('--');
        if (seen.has(key)) continue;
        seen.add(key);
        const nodeB = MAP_NODES[bId];
        const mid = edgeVia(aId, bId);
        viaPoints.push(...mid);
        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        for (const pt of mid) {
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.lineTo(nodeB.x, nodeB.y);
        ctx.stroke();
      }
    }
    for (const pt of viaPoints) {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [id, n] of Object.entries(MAP_NODES)) {
      ctx.fillStyle = '#00f5ff';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00222b';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(id, n.x + 10, n.y - 6);
    }
    // Zone circles & plaque targets
    for (const z of MAP_ZONES) {
      ctx.strokeStyle = '#ff4081';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff4081';
      ctx.beginPath();
      ctx.arc(z.x, z.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd54f';
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.lineTo(z.labelX, z.labelY);
      ctx.stroke();
    }
    // Candidate slots
    CANDIDATE_STAGE_SLOTS.forEach((slot, idx) => {
      ctx.strokeStyle = '#76ff03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#76ff03';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`cand${idx}`, slot.x - 16, slot.y - 24);
    });
    // Furnace & arena FX anchors
    for (const [label, pt] of [
      ['FURNACE', ALCHEMY_FURNACE],
      ['ARENA', ARENA_CENTER],
    ] as const) {
      ctx.fillStyle = '#ffab00';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(label, pt.x + 10, pt.y + 4);
    }
    ctx.restore();
  }

  // 12. Real-time Floating Event & Thought Bubbles (5 semantic palettes, stationary in-place fade)
  const BUBBLE_PALETTES: Record<
    FloatingBubble['tone'],
    { bg: string; stroke: string; text: string }
  > = {
    system: { bg: 'rgba(34, 24, 66, 0.94)', stroke: '#b197fc', text: '#f3ecff' },
    alchemy: { bg: 'rgba(68, 30, 12, 0.94)', stroke: '#ffa94d', text: '#fff4e6' },
    combat: { bg: 'rgba(74, 18, 22, 0.94)', stroke: '#ff786c', text: '#ffeceb' },
    breakthrough: { bg: 'rgba(56, 38, 8, 0.95)', stroke: '#ffd43b', text: '#fff9db' },
    public: { bg: 'rgba(253, 251, 245, 0.95)', stroke: '#56b89a', text: '#18302a' },
  };
  const placedBoxes: Array<{ sx: number; sy: number; sw: number }> = [];
  for (const b of bubbles.value) {
    const liveActor = b.memberId ? actorMap.get(b.memberId) : null;
    const anchorX = liveActor ? liveActor.x : b.x;
    const anchorY = liveActor ? liveActor.y : b.y;
    const screen = worldToScreen(anchorX, anchorY);
    const alpha = Math.min(1, b.ttl / 0.9);
    withUi(ctx, anchorX, anchorY, k, () => {
      ctx.globalAlpha = alpha;
      ctx.font = '12px "LXGW WenKai", sans-serif';
      const lines = wrapCanvasBubbleLines(ctx, b.text, 232);
      const maxLineW = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
      const bw = Math.max(108, Math.ceil(maxLineW + 28));
      const bh = lines.length > 1 ? 48 : 30;
      const lineStep = 18;
      let by = -46 - bh;

      // 水平防出界钳位
      const halfScreenPx = (bw / 2) * k * scale;
      let offsetX = 0;
      if (screen.x - halfScreenPx < 12) {
        offsetX = (12 - (screen.x - halfScreenPx)) / (k * scale);
      } else if (screen.x + halfScreenPx > viewport.width - 12) {
        offsetX = (viewport.width - 12 - (screen.x + halfScreenPx)) / (k * scale);
      }

      // 与已有邻近气泡垂直避让防叠压
      const boxSw = bw * k * scale;
      const boxSx = screen.x + offsetX * k * scale;
      let boxSy = screen.y + (by + bh / 2) * k * scale;
      for (const prev of placedBoxes) {
        if (Math.abs(boxSx - prev.sx) < (boxSw + prev.sw) * 0.46 && Math.abs(boxSy - prev.sy) < 46) {
          by -= Math.ceil(52 / (k * scale));
          boxSy = screen.y + (by + bh / 2) * k * scale;
        }
      }
      placedBoxes.push({ sx: boxSx, sy: boxSy, sw: boxSw });

      const pal = BUBBLE_PALETTES[b.tone] ?? BUBBLE_PALETTES.public;
      ctx.fillStyle = pal.bg;
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(offsetX - bw / 2, by, bw, bh, 9);
      ctx.fill();
      ctx.stroke();

      const firstLineY = by + (bh - (lines.length - 1) * lineStep) / 2;
      const isDarkBg = b.tone !== 'public';
      lines.forEach((line, idx) => {
        drawRichCanvasLine(ctx, line, offsetX, firstLineY + idx * lineStep, isDarkBg, knownEntityNames.value);
      });
    });
  }

  // 13. Sky-Pillar & Shockwave VFX (Breakthrough / Miracle / Crit / Conquest)
  for (const beam of skyBeams.value) {
    const liveActor = beam.memberId ? actorMap.get(beam.memberId) : null;
    const bx = liveActor ? liveActor.x : beam.x;
    const by = liveActor ? liveActor.y : beam.y;
    const prog = 1 - beam.ttl / beam.maxTtl;
    const alpha = Math.sin(Math.min(1, prog * 1.4) * Math.PI) * 0.85;
    withUi(ctx, bx, by, k, () => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      const colGrad = ctx.createLinearGradient(0, -240, 0, 22);
      colGrad.addColorStop(0, hexToRgba(beam.color, 0));
      colGrad.addColorStop(0.55, hexToRgba(beam.color, 0.55));
      colGrad.addColorStop(1, hexToRgba(beam.color, 0.08));
      const beamW = 46 * (1 - prog * 0.35);
      ctx.fillStyle = colGrad;
      ctx.fillRect(-beamW / 2, -240, beamW, 260);
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(0, 14, 24 + prog * 54, 9 + prog * 22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  // 14. Floating Stat / Breakthrough Gain Popups (short capped ease-out lift)
  for (const p of popups.value) {
    const liveActor = p.memberId ? actorMap.get(p.memberId) : null;
    const ax = liveActor ? liveActor.x : p.x;
    const ay = liveActor ? liveActor.y : p.y;
    const hasBubble = Boolean(p.memberId && bubbles.value.some((b) => b.memberId === p.memberId));
    const prog = 1 - p.ttl / p.maxTtl;
    const alpha = p.ttl < 0.45 ? p.ttl / 0.45 : 1;
    withUi(ctx, ax, ay, k, () => {
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 14px "LXGW WenKai", sans-serif';
      const py = (hasBubble ? -96 : -48) - Math.min(1, prog * 2.4) * 14;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(12, 32, 29, 0.92)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(p.text, 0, py);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, py);
    });
  }
}

function wrapCanvasBubbleLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxLinePx: number,
): string[] {
  if (ctx.measureText(text).width <= maxLinePx || text.length <= 8) {
    return [text];
  }
  const len = text.length;
  const minSplit = Math.floor(len * 0.34);
  const maxSplit = Math.ceil(len * 0.72);
  let bestPunctSplit = -1;
  let bestDist = Infinity;
  const mid = len / 2;
  for (let i = minSplit; i < Math.min(len - 1, maxSplit); i += 1) {
    if ('，、：；！？。'.includes(text[i])) {
      const splitAt = i + 1;
      const d = Math.abs(splitAt - mid);
      if (d < bestDist) {
        bestDist = d;
        bestPunctSplit = splitAt;
      }
    }
  }
  if (bestPunctSplit > 0) {
    const l1 = text.slice(0, bestPunctSplit);
    const l2 = text.slice(bestPunctSplit);
    if (l1 && l2 && ctx.measureText(l1).width <= maxLinePx + 24 && ctx.measureText(l2).width <= maxLinePx + 24) {
      return [l1, l2];
    }
  }

  const totalW = ctx.measureText(text).width;
  const targetW = totalW / 2;
  let acc = 0;
  let splitIdx = Math.ceil(len / 2);
  for (let i = 0; i < len - 1; i += 1) {
    acc += ctx.measureText(text[i]).width;
    if (acc >= targetW) {
      splitIdx = i + 1;
      break;
    }
  }
  // 避免行首出现标点符号
  if (splitIdx < len - 1 && '，、：；！？。'.includes(text[splitIdx])) {
    splitIdx += 1;
  }
  return [text.slice(0, splitIdx), text.slice(splitIdx)].filter(Boolean);
}

let rafId = 0;
let lastFrameMs = 0;
let lastDomSyncMs = 0;
let ambientBubbleTimer = 2.5;
let resizeObserver: ResizeObserver | null = null;

function stepSimulationFrame(nowMs: number) {
  const dt = lastFrameMs ? Math.min(0.05, (nowMs - lastFrameMs) / 1000) : 0.016;
  lastFrameMs = nowMs;

  if (!props.reducedMotion) {
    for (const p of petals) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 1.1;
      if (p.y > MAP_HEIGHT + 10) {
        p.y = -10;
        p.x = (p.x + 280) % MAP_WIDTH;
      }
      if (p.x > MAP_WIDTH + 10) p.x = -10;
    }
  }

  // Smooth waypoint locomotion for every member
  const walkSpeed = props.reducedMotion ? 90 : 52;
  activeMembers.value.forEach((m, idx) => {
    const actor = actorMap.get(m.id);
    if (!actor) return;
    if (actor.waypoints.length > 0) {
      const wp = actor.waypoints[0];
      const dx = wp.x - actor.x;
      const dy = wp.y - actor.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 3) {
        actor.x = wp.x;
        actor.y = wp.y;
        actor.waypoints.shift();
      } else {
        actor.facing = dx >= 0 ? 1 : -1;
        actor.x += (dx / dist) * walkSpeed * dt;
        actor.y += (dy / dist) * walkSpeed * dt;
      }
    } else if (!m.currentActivity && !props.reducedMotion) {
      actor.idleTimer -= dt;
      if (actor.idleTimer <= 0) {
        actor.idleTimer = 6 + ((idx * 17) % 6);
        const patrolPool = [
          'bagua_plaza',
          'hall_steps',
          'alchemy_yard',
          'spring_bridge',
          'arena_deck',
          'gate_plaza',
          'heritage_steps',
          'pass_trail',
        ];
        const pickNode = patrolPool[(Math.floor(nowMs / 1000) + idx * 3) % patrolPool.length];
        const angle = ((idx + nowMs * 0.001) % 6.28);
        assignRoute(actor, pickNode, Math.cos(angle) * 28, Math.sin(angle) * 16);
      }
    }
  });

  // Ambient thought bubble (strictly 1 bubble max on screen, every ~11s)
  if (!props.reducedMotion) {
    ambientBubbleTimer -= dt;
    if (ambientBubbleTimer <= 0 && activeMembers.value.length > 0) {
      if (bubbles.value.length > 0) {
        ambientBubbleTimer = 5.0;
      } else {
        const settledMembers = activeMembers.value.filter((mem) => {
          const ac = actorMap.get(mem.id);
          return ac && ac.waypoints.length === 0;
        });
        if (settledMembers.length === 0) {
          ambientBubbleTimer = 1.8;
        } else {
          ambientBubbleTimer = 11.0;
          const tickSlot = Math.floor(nowMs / 1000);
          const m = settledMembers[tickSlot % settledMembers.length];
          const actor = actorMap.get(m.id);
          if (actor) {
            const roleOrTraits = new Set<string>([m.personality, 'any']);
            if (m.role === 'sect_master') roleOrTraits.add('sect_master');
            if (m.role === 'elder') roleOrTraits.add('elder');

            const canShowSecret =
              props.perspective === 'system'
                ? tickSlot % 2 === 1
                : props.perspective === 'host' && m.id === props.viewHostId && tickSlot % 2 === 1;

            const activeTexts = new Set(bubbles.value.map((b) => b.text));
            let chosenText = '';

            if (m.currentActivity) {
              const actKind = m.currentActivity.kind;
              const actPool = activityBubbles.filter((b) => b.activity === actKind);
              const matchedPool = actPool.filter((b) => roleOrTraits.has(b.personality));
              const basePool = matchedPool.length > 0 ? matchedPool : actPool;
              const freshPool = basePool.filter(
                (b) => !activeTexts.has(canShowSecret ? b.secretHostBubble : b.publicBubble),
              );
              const finalPool = freshPool.length > 0 ? freshPool : basePool;
              const picked = finalPool[tickSlot % finalPool.length];
              if (picked) {
                chosenText = canShowSecret ? picked.secretHostBubble : picked.publicBubble;
              }
            } else {
              let nearestZone: MapZoneId = 'hall';
              let bestDist = Infinity;
              for (const z of MAP_ZONES) {
                const d = Math.hypot(actor.x - z.x, actor.y - z.y);
                if (d < bestDist) {
                  bestDist = d;
                  nearestZone = z.id;
                }
              }
              const hasCandidates = pendingCandidates.value.length > 0;
              const zoneItems = mapBubbles.filter(
                (b) =>
                  b.zone === nearestZone &&
                  (hasCandidates || (!b.publicBubble.includes('验骨龄') && !b.secretHostBubble.includes('验骨龄'))),
              );
              const traitPool = zoneItems.filter((b) => roleOrTraits.has(b.personality));
              const basePool = traitPool.length > 0 ? traitPool : zoneItems;
              const freshPool = basePool.filter(
                (b) => !activeTexts.has(canShowSecret ? b.secretHostBubble : b.publicBubble),
              );
              const finalPool = freshPool.length > 0 ? freshPool : basePool;
              const picked = finalPool[tickSlot % finalPool.length] ?? mapBubbles[0];
              chosenText = canShowSecret ? picked.secretHostBubble : picked.publicBubble;
            }

            if (chosenText) {
              bubbles.value = [
                {
                  id: `ambient-${nowMs}`,
                  memberId: m.id,
                  x: actor.x,
                  y: actor.y,
                  text: chosenText,
                  tone: canShowSecret ? 'system' : 'public',
                  ttl: 3.4,
                  maxTtl: 3.4,
                },
              ];
            }
          }
        }
      }
    }
  }

  // Decay bubbles & popups
  if (bubbles.value.length > 0) {
    bubbles.value = bubbles.value
      .map((b) => ({ ...b, ttl: b.ttl - dt }))
      .filter((b) => b.ttl > 0);
  }
  if (popups.value.length > 0) {
    popups.value = popups.value
      .map((p) => ({ ...p, ttl: p.ttl - dt }))
      .filter((p) => p.ttl > 0);
  }
  if (skyBeams.value.length > 0) {
    skyBeams.value = skyBeams.value
      .map((s) => ({ ...s, ttl: s.ttl - dt }))
      .filter((s) => s.ttl > 0);
  }

  renderScene(nowMs / 1000);
  if (nowMs - lastDomSyncMs >= 160) {
    lastDomSyncMs = nowMs;
    refreshActorScreenPositions();
  }
  rafId = window.requestAnimationFrame(stepSimulationFrame);
}

onMounted(() => {
  getImage('assets/scenes/sect_map_qingheng.webp');
  syncActorsWithMembers();
  if (stageRef.value) {
    const updateSize = () => {
      if (!stageRef.value) return;
      viewport.width = stageRef.value.clientWidth || 960;
      viewport.height = stageRef.value.clientHeight || 640;
      const { minZoom } = getTransformParams();
      if (camera.zoom < minZoom) {
        camera.zoom = minZoom;
      }
      clampCameraPan();
      refreshActorScreenPositions();
    };
    updateSize();
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(stageRef.value);
  }
  refreshActorScreenPositions();
  rafId = window.requestAnimationFrame(stepSimulationFrame);
});

watch(
  [() => camera.zoom, () => camera.panX, () => camera.panY, () => viewport.width, () => viewport.height],
  () => refreshActorScreenPositions(),
);

onBeforeUnmount(() => {
  if (rafId) window.cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
});
</script>

<template>
  <section ref="stageRef" class="sect-map-stage" data-testid="sect-map-stage" aria-label="宗门山门互动地图">
    <canvas
      ref="canvasRef"
      class="sect-map-canvas"
      data-testid="sect-map-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="dragState = null"
      @wheel="onWheel"
    />

    <!-- 与世界坐标精准对齐的可访问热区按钮（便于键盘及高精度触控/测试） -->
    <div class="map-hit-layer" aria-hidden="false">
      <button
        v-for="z in zoneScreenPositions"
        :key="z.id"
        type="button"
        class="map-zone-hotspot"
        :style="{ left: `${z.sx}px`, top: `${z.sy}px` }"
        :data-testid="`map-zone-${z.id}`"
        :title="`${z.name}：${z.actionHint}`"
        :aria-label="`${z.name}：${z.actionHint}`"
        @mouseenter="hoveredZoneId = z.id"
        @mouseleave="hoveredZoneId = null"
        @click="emit('zone-action', z.id)"
      />
      <button
        v-for="a in actorScreenPositions"
        :key="a.id"
        type="button"
        class="map-actor-hotspot"
        :style="{ left: `${a.x}px`, top: `${a.y}px` }"
        :data-testid="`map-actor-${a.id}`"
        :title="`选中宿主 ${a.name}`"
        :aria-label="`选中宿主 ${a.name}`"
        @mouseenter="hoveredActorId = a.id"
        @mouseleave="hoveredActorId = null"
        @click="emit('select-member', a.id)"
      />
    </div>

    <!-- 大地图直接交互Pin：寒鸦敌哨奇袭 & 天道算力外挂三选一 -->
    <button
      v-if="perspective === 'system' && passZonePos && !systemView.sectCrisis.outpostCleared"
      type="button"
      class="map-floating-pin outpost"
      :style="{ left: `${Math.max(66, Math.min(viewport.width - 66, passZonePos.sx))}px`, top: `${passZonePos.sy}px` }"
      data-testid="map-pin-outpost"
      @click="emit('raid-outpost')"
    >
      🎯 敌哨·奇袭
    </button>
    <button
      v-if="perspective === 'system' && hallZonePos && systemView.pendingPerkChoices && systemView.pendingPerkChoices.length > 0"
      type="button"
      class="map-floating-pin draft"
      :style="{ left: `${Math.max(66, Math.min(viewport.width - 66, hallZonePos.sx))}px`, top: `${hallZonePos.sy}px` }"
      data-testid="map-pin-draft"
      @click="emit('open-perk-draft')"
    >
      🎁 外挂三选一!
    </button>

    <!-- 中上悬浮：非阻塞天机实况演出卷（仅破大境/道统/大捷/大比弹窗） -->
    <SpotlightTheater
      :system-view="systemView"
      :recent-facts="recentFacts"
      :perspective="perspective"
      :view-host-id="viewHostId"
      :reduced-motion="reducedMotion"
      :guide-open="false"
    />

    <!-- 左下角：单行山门实时飞报条 -->
    <button
      type="button"
      class="map-ticker"
      title="点击展开三视角纪事与详细战报/丹报"
      @click="emit('open-chronicle')"
    >
      <div v-for="item in visibleTickerFacts" :key="item.id" class="map-ticker-line">
        <span class="ticker-badge" :class="item.tone">{{ item.badgeText }}</span>
        <span class="ticker-text"><RichText :text="item.text" theme="light" /></span>
      </div>
    </button>

    <!-- 右下角：仅保留地图缩放按钮 -->
    <div class="map-bottom-right">
      <div class="map-zoom-controls" aria-label="地图缩放控制">
        <button type="button" data-testid="map-zoom-in" title="放大山门视图" @click="adjustZoom(0.15)">+</button>
        <button type="button" data-testid="map-zoom-out" title="缩小山门视图" @click="adjustZoom(-0.15)">-</button>
        <button type="button" data-testid="map-zoom-reset" title="重置山门视角" @click="resetCamera">⌖</button>
      </div>
    </div>
  </section>
</template>
