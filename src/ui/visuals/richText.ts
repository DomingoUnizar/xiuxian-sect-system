export type RichTokenClass =
  | 'rt-plain'
  | 'rt-name'
  | 'rt-quote-method'
  | 'rt-quote-pill'
  | 'rt-quote-weapon'
  | 'rt-quote-gold'
  | 'rt-realm-high'
  | 'rt-realm-mid'
  | 'rt-realm-low'
  | 'rt-stat-jade'
  | 'rt-stat-gold'
  | 'rt-stat-crit'
  | 'rt-stat-power'
  | 'rt-stat-amber'
  | 'rt-tag-ding'
  | 'rt-tag-combat'
  | 'rt-tag-step';

export interface RichSegment {
  text: string;
  cls: RichTokenClass;
}

export const CANVAS_TOKEN_COLORS: Record<'light' | 'dark', Record<RichTokenClass, string>> = {
  light: {
    'rt-plain': '#586964',
    'rt-name': '#1352ad',
    'rt-quote-method': '#662bb0',
    'rt-quote-pill': '#bf4906',
    'rt-quote-weapon': '#b82522',
    'rt-quote-gold': '#965604',
    'rt-realm-high': '#a61848',
    'rt-realm-mid': '#5333ba',
    'rt-realm-low': '#0b705c',
    'rt-stat-jade': '#097843',
    'rt-stat-gold': '#a65c00',
    'rt-stat-crit': '#c2185b',
    'rt-stat-power': '#c22521',
    'rt-stat-amber': '#b04a06',
    'rt-tag-ding': '#965604',
    'rt-tag-combat': '#b82522',
    'rt-tag-step': '#11637a',
  },
  dark: {
    'rt-plain': '#cde0d9',
    'rt-name': '#7ecbff',
    'rt-quote-method': '#dbb3ff',
    'rt-quote-pill': '#ffb36b',
    'rt-quote-weapon': '#ff8b85',
    'rt-quote-gold': '#ffdc73',
    'rt-realm-high': '#ff8cc8',
    'rt-realm-mid': '#c8abff',
    'rt-realm-low': '#63f2c7',
    'rt-stat-jade': '#57f2ad',
    'rt-stat-gold': '#ffe26b',
    'rt-stat-crit': '#ff7ac0',
    'rt-stat-power': '#ff847a',
    'rt-stat-amber': '#ffbb63',
    'rt-tag-ding': '#ffe26b',
    'rt-tag-combat': '#ff847a',
    'rt-tag-step': '#78e6f7',
  },
};

export function resolveRealmTierClass(realm: string): 'rt-realm-high' | 'rt-realm-mid' | 'rt-realm-low' {
  if (['元婴', '出窍', '化神', '炼虚', '合体', '大乘', '渡劫', '无漏'].includes(realm)) {
    return 'rt-realm-high';
  }
  if (['筑基', '紫府', '金丹'].includes(realm)) {
    return 'rt-realm-mid';
  }
  return 'rt-realm-low';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyBracketTag(token: string): RichTokenClass {
  if (/战|捷|胜|败|大捷|首领/.test(token)) return 'rt-tag-combat';
  if (/现场|结局|辨纹|铸形|交付|传法|抉择/.test(token)) return 'rt-tag-step';
  return 'rt-tag-ding';
}

function classifyQuoted(token: string): RichTokenClass {
  if (token.startsWith('《')) return 'rt-quote-method';
  const inner = token.slice(1, -1);
  if (/法|诀|典|术|经|功|步|式|指|拳|阵/.test(inner)) return 'rt-quote-method';
  if (/剑|刀|枪|斧|戟|弓|锤|印|镜|铃|伞|钟|炉胆|炉|盾|鞭|兵|甲/.test(inner)) return 'rt-quote-weapon';
  if (/丹|草|露|花|玉|丸|药|果|茶/.test(inner)) return 'rt-quote-pill';
  return 'rt-quote-gold';
}

const HIGH_REALM_RE = /(?:无漏|渡劫|大乘|合体|炼虚|化神|出窍|元婴)(?:九层圆满|[0-9]+层)?|(?:天品|帝器|仙阶|天阶|地阶|极品)/;
const MID_REALM_RE = /(?:金丹|紫府|筑基)(?:九层圆满|[0-9]+层)?|(?:地品|玄阶|上品)/;
const LOW_REALM_RE = /(?:炼气)(?:九层圆满|[0-9]+层)?|(?:凡品|凡阶|黄阶|中品|下品)/;

const BASE_REGEX_CACHE = new Map<string, RegExp>();

function buildCombinedRegex(entityNames: readonly string[]): RegExp {
  const uniqueNames = Array.from(
    new Set(entityNames.map((n) => n.trim()).filter((n) => n.length >= 2)),
  ).sort((a, b) => b.length - a.length || a.localeCompare(b));

  const cacheKey = uniqueNames.join('\u0001');
  const cached = BASE_REGEX_CACHE.get(cacheKey);
  if (cached) {
    return new RegExp(cached.source, 'g');
  }

  const nameBranch = uniqueNames.length > 0 ? uniqueNames.map(escapeRegExp).join('|') : null;
  const parts: string[] = [
    '(?<tag>【[^】]+】)',
    '(?<step>第[0-9]+合)',
    '(?<quote>「[^」]+」|《[^》]+》)',
    '(?<crit>[×x]\\s*[0-9]+\\s*倍(?:气运暴击)?)',
    '(?<power>(?:战力|攻|防)\\s*[+＋-]?\\s*[0-9]+)',
    '(?<jade>[+＋-]?[0-9]+\\s*(?:点|份)?(?:可用)?(?:道源|缕灵气|缕|轮灌顶|轮修为|轮))',
    '(?<gold>[+＋-]?[0-9]+\\s*(?:点)?(?:道统)?(?:根基|声望|灵脉)|灵脉\\s*[0-9]+\\s*阶|九层圆满)',
    '(?<amber>(?:悟性|根骨|神魂|心性|气运)\\s*[+＋-]?\\s*[0-9]+|[+＋-]?[0-9]+\\s*%|(?:下品|中品|上品|极品)?灵石\\s*[×x]?\\s*[0-9]+|[×x]\\s*[0-9]+|(?:余|仅|限|需)\\s*[0-9]+\\s*(?:刻|天|日|岁|株|份|枚|张|席|人)|[+＋][0-9]+)',
    `(?<rhigh>${HIGH_REALM_RE.source})`,
    `(?<rmid>${MID_REALM_RE.source})`,
    `(?<rlow>${LOW_REALM_RE.source})`,
  ];
  if (nameBranch) {
    parts.push(`(?<name>${nameBranch})`);
  }

  const re = new RegExp(parts.join('|'), 'g');
  if (BASE_REGEX_CACHE.size > 24) {
    BASE_REGEX_CACHE.clear();
  }
  BASE_REGEX_CACHE.set(cacheKey, re);
  return new RegExp(re.source, 'g');
}

export function tokenizeRichText(
  text: string,
  entityNames: readonly string[] = [],
): RichSegment[] {
  if (!text) return [];
  const regex = buildCombinedRegex(entityNames);
  const out: RichSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      out.push({ text: text.slice(cursor, idx), cls: 'rt-plain' });
    }
    const g = match.groups ?? {};
    const raw = match[0];
    let cls: RichTokenClass = 'rt-plain';
    if (g.tag) cls = classifyBracketTag(raw);
    else if (g.step) cls = 'rt-tag-step';
    else if (g.quote) cls = classifyQuoted(raw);
    else if (g.crit) cls = 'rt-stat-crit';
    else if (g.power) cls = 'rt-stat-power';
    else if (g.jade) cls = 'rt-stat-jade';
    else if (g.gold) cls = 'rt-stat-gold';
    else if (g.amber) cls = 'rt-stat-amber';
    else if (g.rhigh) cls = 'rt-realm-high';
    else if (g.rmid) cls = 'rt-realm-mid';
    else if (g.rlow) cls = 'rt-realm-low';
    else if (g.name) cls = 'rt-name';

    out.push({ text: raw, cls });
    cursor = idx + raw.length;
  }

  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), cls: 'rt-plain' });
  }
  return out;
}
