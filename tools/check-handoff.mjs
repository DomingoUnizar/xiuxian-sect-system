import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const slots = ["reliefRun", "surveyRun", "checks", "trace", "mobile", "desktop", "playtest"];
const present = value => typeof value === "string" && value.trim().length > 0;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function checkCues(cues) {
  requireThat(Array.isArray(cues) && cues.length > 0, "缺少事件反馈清单");
  const seen = new Set();
  for (const cue of cues) {
    requireThat(present(cue.event) && !seen.has(cue.event), "反馈条目缺少唯一事件 ID");
    seen.add(cue.event);
    requireThat(["routine", "notable", "major"].includes(cue.tier) && present(cue.reason), cue.event + " 缺少重要性或取舍理由");
    requireThat(Array.isArray(cue.channels) && cue.channels.length > 0, cue.event + " 缺少反馈渠道");
    for (const channel of cue.channels) {
      requireThat(["visual", "text", "portrait", "audio", "vfx"].includes(channel), "未知渠道 " + channel);
      if (channel === "audio" || channel === "vfx") {
        const binding = cue.bindings?.[channel];
        requireThat(present(binding?.assetId) && present(binding.licenseRef) && Number.isFinite(binding.offsetMs) && binding.offsetMs >= 0,
          cue.event + " 的 " + channel + " 缺素材 ID、许可或相对事件的播放时间");
      }
    }
  }
}

async function evidenceFile(slot, relativePath) {
  requireThat(present(relativePath) && !path.isAbsolute(relativePath), slot + " 需要仓库相对路径");
  const absolute = path.resolve(root, relativePath);
  const local = path.relative(root, absolute);
  requireThat(!path.isAbsolute(local) && local !== ".." && !local.startsWith(".." + path.sep), slot + " 路径超出工作树");
  const info = await stat(absolute);
  requireThat(info.isFile() && info.size > 0, slot + " 证据文件为空");
  if (["mobile", "desktop", "trace"].includes(slot)) {
    const handle = await open(absolute, "r");
    try {
      const header = Buffer.alloc(12);
      await handle.read(header, 0, header.length, 0);
      const signature = header.toString("hex");
      const screenshot = signature.startsWith("89504e470d0a1a0a") || signature.startsWith("ffd8ff") ||
        (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP");
      requireThat(slot === "trace" ? signature.startsWith("504b0304") : screenshot, slot + " 的文件格式不符");
    } finally {
      await handle.close();
    }
  }
  return absolute;
}

function checkRun(run, policy) {
  requireThat(run.policy === policy, "期望政策 " + policy);
  requireThat(["seed", "rulesVersion", "contentVersion", "rngVersion"].every(key => present(run[key])) &&
    Number.isSafeInteger(run.endTick) && run.endTick > 0, "缺少种子、版本或结束刻");
  for (const key of ["startHash", "commonInputsHash"]) {
    requireThat(typeof run[key] === "string" && /^[a-f0-9]{64}$/i.test(run[key]), key + " 应为 SHA-256");
  }
  requireThat(present(run.nextOpportunity) && Array.isArray(run.chain) && run.chain.length >= 3, policy + " 需要后继机会与至少三步因果");
  const ids = new Set();
  for (const [i, fact] of run.chain.entries()) {
    requireThat(present(fact.id) && !ids.has(fact.id), policy + " 的事实 ID 缺失或重复");
    requireThat(i === 0 || (Array.isArray(fact.parents) && fact.parents.includes(run.chain[i - 1].id)), policy + " 的相邻两步没有因果引用");
    ids.add(fact.id);
  }
  requireThat(run.chain[0].kind === "policy_applied" && run.chain[0].value === policy, "因果链需要始于本档政策");
  const last = run.chain.at(-1);
  requireThat(last.kind === "opportunity_opened" && last.opportunityId === run.nextOpportunity, "后继机会没有对应事实");
}

async function main() {
  const args = process.argv.slice(2);
  const accept = args.includes("--accept");
  const files = args.filter(arg => arg !== "--accept");
  requireThat(files.length <= 1, "用法 node tools/check-handoff.mjs [工单.json] [--accept]");
  const ticketFile = files[0] ?? path.join(root, "docs/plan/neon-m1.json");
  const ticket = JSON.parse(await readFile(ticketFile, "utf8"));
  requireThat(present(ticket.id) && present(ticket.goal) && present(ticket.baseBranch), "缺少工单 ID、目标或起点");
  requireThat(present(ticket.implementationOwner) && present(ticket.acceptanceOwner) &&
    ticket.implementationOwner !== ticket.acceptanceOwner, "实现与独立验收需分别指定");
  checkCues(ticket.feedback);
  requireThat(slots.every(slot => Object.hasOwn(ticket.evidence ?? {}, slot)), "首版工单的证据槽不完整");
  const missing = slots.filter(slot => !present(ticket.evidence[slot]));
  if (!accept) {
    console.log(ticket.id + " 工单可用。待补证据 " + (missing.join(", ") || "0") + "。本次仅检查计划。");
    return;
  }
  requireThat(missing.length === 0, "缺少验收证据 " + missing.join(", "));
  const paths = {};
  for (const slot of slots) {
    paths[slot] = await evidenceFile(slot, ticket.evidence[slot]);
  }
  requireThat(new Set(Object.values(paths)).size === slots.length, "不同证据槽应引用各自的文件");
  const [mobile, desktop] = await Promise.all([readFile(paths.mobile), readFile(paths.desktop)]);
  requireThat(!mobile.equals(desktop), "两种视口的截图内容相同");
  const relief = JSON.parse(await readFile(paths.reliefRun, "utf8"));
  const survey = JSON.parse(await readFile(paths.surveyRun, "utf8"));
  checkRun(relief, "relief");
  checkRun(survey, "survey");
  for (const key of ["seed", "startHash", "commonInputsHash", "rulesVersion", "contentVersion", "rngVersion", "endTick"]) {
    requireThat(relief[key] === survey[key], "对照条件不一致 " + key);
  }
  requireThat(relief.nextOpportunity !== survey.nextOpportunity, "两项政策没有产生不同的后继机会");
  console.log(ticket.id + " 证据齐全，双档因果可比。请独立复玩并裁定体验。");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
