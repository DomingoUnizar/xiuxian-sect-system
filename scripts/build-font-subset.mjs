import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const ROOT = process.cwd();
const SRC_FONT = 'D:\\GeminiProjects\\修仙素材\\字体素材\\LXGWWenKai-Regular.ttf';
const OUT_FONT = path.join(ROOT, 'public/assets/fonts/LXGWWenKai-subset.woff2');

function walkFiles(dir, exts, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, acc);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [
  path.join(ROOT, 'index.html'),
  ...walkFiles(path.join(ROOT, 'src'), ['.ts', '.vue', '.json', '.css']),
];

const charSet = new Set(
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()-_=+[]{}|;:\'",.<>?/`~ \\n·—…「」『』【】（）《》：；，。！？、＋－×÷∶✓●• ',
);

// 补充常用界面、修真境界、百艺、灵根、战报常用字，确保玩家输入或动态生成文案绝不缺字
const extraChars =
  '修仙系统模拟器修真界宗门系统开山招贤宿主流派秘密绑定私令发布推演道源道统根基自动悬赏规则赐予多人因果法器丹药灵石灵草凡炉铁剑遁符试剑台擂上首胜首炼灵丹成丹入库去向离山归来简报纪事公开视角私密保护境界凡人淬体炼气筑基紫府金丹元婴出窍化神炼虚合体大乘渡劫无漏灵根金木水火土雷风冰品下中上极玄地天帝器传承分火提清法青莲回锋诀青松试剑势引火起炉诀周墨顾长风寒鸦岭妖狼战力气血灵力修为伤势忍痛推辞到期失败兑现账本预留释放存档导入导出重开种子静音雅乐音效动态常规减弱暂停流逝';
for (const ch of extraChars) {
  charSet.add(ch);
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const ch of content) {
    charSet.add(ch);
  }
}

const text = Array.from(charSet).join('');
const inputBuffer = fs.readFileSync(SRC_FONT);
const subsetBuffer = await subsetFont(inputBuffer, text, {
  targetFormat: 'woff2',
});

fs.mkdirSync(path.dirname(OUT_FONT), { recursive: true });
fs.writeFileSync(OUT_FONT, subsetBuffer);
console.log(
  `Built ${OUT_FONT} from ${charSet.size} unique chars: ${(subsetBuffer.byteLength / 1024).toFixed(2)} KiB`,
);
