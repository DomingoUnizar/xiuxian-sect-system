import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'src', 'content');
const DROPS_DIR = path.join(CONTENT_DIR, 'drops');

const FORBIDDEN_PUBLIC_TERMS = [
  '系统',
  '【叮',
  '私令',
  '道源',
  '道统根基',
  '十轮修为灌注',
  '宿主',
  '绑定',
  '任务面板',
  '金手指',
  '云岚宗',
  '云岗宗',
];

const PUBLIC_KEYS = new Set([
  'publicBubble',
  'publicSummary',
  'background',
  'personalGoal',
  'auditionLine',
  'acceptLine',
  'declineLine',
  'lore',
  'shortReport',
  'opening',
]);

function scanObject(node, fileLabel, currentPath, issues) {
  if (typeof node === 'string') {
    const key = currentPath.split('.').pop()?.replace(/\[\d+\]/g, '') ?? '';
    if (PUBLIC_KEYS.has(key)) {
      for (const bad of FORBIDDEN_PUBLIC_TERMS) {
        if (node.includes(bad)) {
          issues.push(`${fileLabel} -> ${currentPath}: 公开字段含禁用词「${bad}」`);
        }
      }
    }
    const isBubbleFile =
      fileLabel === path.join('src', 'content', 'map_bubbles.json') ||
      fileLabel === path.join('src', 'content', 'activity_bubbles.json');
    if (isBubbleFile && (key === 'publicBubble' || key === 'secretHostBubble')) {
      if (node.includes('…') || node.includes('...')) {
        issues.push(`${fileLabel} -> ${currentPath}: 气泡文本含禁止省略号「${node}」`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, idx) => scanObject(item, fileLabel, `${currentPath}[${idx}]`, issues));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      scanObject(v, fileLabel, currentPath ? `${currentPath}.${k}` : k, issues);
    }
  }
}

const targets = [];
for (const name of [
  'map_bubbles.json',
  'activity_bubbles.json',
  'candidates_pool.json',
  'mission_templates_ext.json',
  'compendium_lore.json',
  'action_reports_pool.json',
  'return_openings.json',
  'content.json',
]) {
  const full = path.join(CONTENT_DIR, name);
  if (fs.existsSync(full)) targets.push(full);
}
if (fs.existsSync(DROPS_DIR)) {
  for (const name of fs.readdirSync(DROPS_DIR)) {
    if (name.endsWith('.json')) targets.push(path.join(DROPS_DIR, name));
  }
}

const issues = [];
let totalCount = 0;

for (const filePath of targets) {
  const rel = path.relative(ROOT, filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const count = Array.isArray(data) ? data.length : 1;
    totalCount += count;
    scanObject(data, rel, '', issues);
    console.log(`OK  ${rel} (${count} entries)`);
  } catch (err) {
    issues.push(`${rel}: JSON 解析失败 (${err instanceof Error ? err.message : String(err)})`);
  }
}

if (issues.length > 0) {
  console.error('\n发现以下红线/格式问题：');
  for (const line of issues) console.error(' - ' + line);
  process.exit(1);
}

console.log(`\n全部 ${targets.length} 个文件（共 ${totalCount} 条记录）本地零额度校验通过！`);
