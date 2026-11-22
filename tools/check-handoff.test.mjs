import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const checker = path.join(root, "tools/check-handoff.mjs");
const original = JSON.parse(await readFile(path.join(root, "docs/plan/neon-m1.json"), "utf8"));

function syntheticRun(policy) {
  const opportunity = policy === "relief" ? "teach_route" : "study_sample";
  return {
    policy, seed: "qa-seed", rulesVersion: "test", contentVersion: "test", rngVersion: "test",
    startHash: "a".repeat(64), commonInputsHash: "b".repeat(64), endTick: 12, nextOpportunity: opportunity,
    chain: [
      { id: "p", kind: "policy_applied", value: policy },
      { id: "r", parents: ["p"] },
      { id: "o", parents: ["r"], kind: "opportunity_opened", opportunityId: opportunity }
    ]
  };
}

test("M1 工单检查器（合成夹具）", async t => {
  const dir = await mkdtemp(path.join(root, ".handoff-test-"));
  t.after(async () => {
    const target = await realpath(dir);
    assert.equal(path.dirname(target), root);
    assert.ok(path.basename(target).startsWith(".handoff-test-"));
    await rm(target, { recursive: true });
  });
  const local = name => path.relative(root, path.join(dir, name));
  const ticket = structuredClone(original);
  const relief = syntheticRun("relief");
  const survey = syntheticRun("survey");
  const contents = {
    reliefRun: JSON.stringify(relief), surveyRun: JSON.stringify(survey),
    checks: "synthetic check log", playtest: "synthetic observation",
    trace: Buffer.from("UEsDBBQAAAAAAAAAIQBYfCPoFQAAABUAAAALAAAAdHJhY2UudHJhY2V7InR5cGUiOiJzeW50aGV0aWMifQpQSwECFAAUAAAAAAAAACEAWHwj6BUAAAAVAAAACwAAAAAAAAAAAAAAgAEAAAAAdHJhY2UudHJhY2VQSwUGAAAAAAEAAQA5AAAAPgAAAAAA", "base64"),
    mobile: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAIAAAAW4yFwAAAAEElEQVR4nGMwSY1hYmBgAAAFpgD4QY7z/AAAAABJRU5ErkJggg==", "base64"),
    desktop: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGN8d389AwMDAAy5An6Zco5rAAAAAElFTkSuQmCC", "base64")
  };
  for (const [slot, content] of Object.entries(contents)) {
    await writeFile(path.join(dir, slot), content);
    ticket.evidence[slot] = local(slot);
  }
  const ticketPath = path.join(dir, "ticket.json");
  async function run(input, ...options) {
    await writeFile(ticketPath, JSON.stringify(input));
    return spawnSync(process.execPath, [checker, ticketPath, ...options], { cwd: root, encoding: "utf8" });
  }
  await t.test("允许计划，拒绝缺少证据的验收", async () => {
    const draft = structuredClone(ticket);
    draft.evidence.trace = null;
    assert.equal((await run(draft)).status, 0);
    assert.match((await run(draft, "--accept")).stderr, /缺少验收证据 trace/);
  });
  await t.test("允许可比的因果证据进入独立复玩", async () => {
    const result = await run(ticket, "--accept");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /独立复玩/);
  });
  await t.test("缺少同步时间或许可的声音不能通过", async () => {
    const bad = structuredClone(ticket);
    bad.feedback.push({ event: "probe", tier: "major", channels: ["audio"], reason: "test" });
    assert.match((await run(bad)).stderr, /缺素材 ID、许可或相对事件的播放时间/);
  });
  await t.test("文本冒充截图时拒绝验收", async () => {
    const bad = structuredClone(ticket);
    bad.evidence.mobile = bad.evidence.checks;
    assert.match((await run(bad, "--accept")).stderr, /mobile 的文件格式不符/);
  });
  await t.test("同一截图复制到另一文件时拒绝验收", async () => {
    const bad = structuredClone(ticket);
    bad.evidence.desktop = local("copy");
    await writeFile(path.join(dir, "copy"), contents.mobile);
    assert.match((await run(bad, "--accept")).stderr, /两种视口的截图内容相同/);
  });
  const variants = [
    ["更换种子", { ...survey, seed: "another" }, /对照条件不一致 seed/],
    ["断裂的因果", { ...survey, chain: [survey.chain[0], { id: "r", parents: ["missing"] }, survey.chain[2]] }, /没有因果引用/],
    ["相同的后继", { ...survey, nextOpportunity: relief.nextOpportunity, chain: [
      ...survey.chain.slice(0, 2), { ...survey.chain[2], opportunityId: relief.nextOpportunity }
    ] }, /没有产生不同的后继机会/]
  ];
  for (const [label, altered, expected] of variants) {
    await t.test("拒绝" + label, async () => {
      await writeFile(path.join(dir, "surveyRun"), JSON.stringify(altered));
      const result = await run(ticket, "--accept");
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
    });
  }
});
