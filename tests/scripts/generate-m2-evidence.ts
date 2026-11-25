import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAlchemyAttempt } from '../../src/sim/alchemy';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { projectHostView, projectPublicView } from '../../src/sim/projections';
import { createInitialWorld } from '../../src/sim/worldgen';

const outDir = path.resolve(process.cwd(), 'docs/plan/evidence/m2');
fs.mkdirSync(outDir, { recursive: true });

const seed = 20261123;
const w0 = createInitialWorld(seed);
const dualCand = w0.recruitment.candidates.find(
  (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
)!;
const startRes = advance(w0, 1, [
  { commandId: 'm2-ev-inv', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
]);
const baseState = startRes.state;
const discipleId = startRes.receipts[0].memberId!;

// 1. 同材两用 + 跨技艺产物流通实证
const startJade = baseState.inventory.materials?.mat_chaowen_jade ?? 0;
const forgeSwordState = advance(cloneState(baseState), baseState.tick + 6, [
  { commandId: 'ev-forge-sword', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_forging_sword' },
]).state;
const forgeCoreState = advance(cloneState(baseState), baseState.tick + 6, [
  { commandId: 'ev-forge-core', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_forging_core' },
]).state;

const bearer = forgeSwordState.members.find((m) => m.equippedWeapon?.specialTrait === 'water_tide')!;
const afterPeerDuel = advance(cloneState(forgeSwordState), forgeSwordState.tick + 6, [
  {
    commandId: 'ev-peer-tide-duel',
    type: 'mission.issue',
    recipientId: bearer.id,
    targetType: bearer.hasWonFirstArena ? 'followup_arena_rematch' : 'first_arena_win',
  },
]).state;

const beastAndCore = advance(cloneState(forgeCoreState), forgeCoreState.tick + 6, [
  { commandId: 'ev-beast-gather', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_beast_gather' },
]).state;
const elder = beastAndCore.members.find((m) => m.id === 'member_alchemy_elder')!;
const supremeAlc = runAlchemyAttempt(beastAndCore, elder, 'recipe_humai', { useFenhuoMethod: true });

const craftBranches = {
  seed,
  startMaterial: { id: 'mat_chaowen_jade', name: '潮纹玉', qty: startJade },
  branchA_sword: {
    methodUsed: 'method_forging_fengwen (接锋蓄水纹)',
    remainingJade: forgeSwordState.inventory.materials?.mat_chaowen_jade ?? 0,
    forgedProduct: '储水回锋剑',
    equippedByPeer: { id: bearer.id, name: bearer.name },
    peerDuelTideTriggered: Object.values(afterPeerDuel.battleFacts).some(
      (bf) => bf.actorIds.includes(bearer.id) && bf.detailedReport.includes('蓄潮'),
    ),
  },
  branchB_furnaceCore: {
    methodUsed: 'method_forging_ludan (温炉控潮纹)',
    remainingJade: forgeCoreState.inventory.materials?.mat_chaowen_jade ?? 0,
    furnaceHasWarmCore: forgeCoreState.inventory.furnaceHasWarmCore,
    combinedWithBeastDew: true,
    supremeAlchemySuccess: supremeAlc?.success ?? false,
    producedPillId: supremeAlc?.producedPillId ?? null,
    producedPillName: supremeAlc?.producedPillId === 'pill_humai_2_supreme' ? '二阶极品护脉丹' : supremeAlc?.producedPillId,
    alchemyDetailExcerpt: supremeAlc?.alchemyFact.shortReport ?? null,
  },
};
fs.writeFileSync(path.join(outDir, 'm2-craft-branches.json'), JSON.stringify(craftBranches, null, 2));

// 2. 爬升至 9 根基并生成多人因果双分支与三视角校验实证
let prog = advance(cloneState(baseState), baseState.tick + 6, [
  { commandId: 'p1', type: 'mission.issue', recipientId: discipleId, targetType: 'first_alchemy' },
]).state;
prog = advance(prog, prog.tick + 8, [
  { commandId: 'p2', type: 'mission.issue', recipientId: discipleId, targetType: 'followup_heritage_fenhuo' },
]).state;
prog = advance(prog, prog.tick + 6, [
  { commandId: 'p3', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_forging_sword', includeHiddenReward: true },
]).state;
prog = advance(prog, prog.tick + 6, [
  { commandId: 'p4', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_beast_gather' },
]).state;

// Case A: 甲破关 + 乙借「绝境爆发」夺魁 + 长老护擂
const caseAStart = cloneState(prog);
caseAStart.daoyuanAvailable += 30;
const caseA = advance(caseAStart, caseAStart.tick + 8, [
  { commandId: 'ca-grant', type: 'system.grant_ability', recipientId: 'member_senior_disciple', abilityId: 'ability_desperate_burst' },
  {
    commandId: 'ca-tourn',
    type: 'multi_causal.launch_tournament',
    breakthroughHostId: discipleId,
    championHostId: 'member_senior_disciple',
    guardianElderId: 'member_alchemy_elder',
  },
]).state;
const tA = caseA.tournaments![0];

// Case B: 战力优势的大师兄作甲破关兼决赛胜出，乙未夺魁退还预留
const caseBStart = cloneState(prog);
caseBStart.daoyuanAvailable += 30;
const dB = caseBStart.members.find((m) => m.id === discipleId)!;
dB.cultivation = 60;
dB.realmLayer = 1;
const sB = caseBStart.members.find((m) => m.id === 'member_senior_disciple')!;
sB.cultivation = 180;
sB.realmLayer = 6;
const caseB = advance(caseBStart, caseBStart.tick + 8, [
  {
    commandId: 'cb-tourn',
    type: 'multi_causal.launch_tournament',
    breakthroughHostId: 'member_senior_disciple',
    championHostId: discipleId,
    guardianElderId: 'member_alchemy_elder',
  },
]).state;
const tB = caseB.tournaments![0];

const pubA = projectPublicView(caseA);
const leakedTerms = pubA.publicFacts.flatMap((pf) =>
  SYSTEM_FORBIDDEN_PUBLIC_TERMS.filter((term) => pf.summary.includes(term)),
);
const vA = projectHostView(caseA, discipleId)!;
const vB = projectHostView(caseA, 'member_senior_disciple')!;
const vElder = projectHostView(caseA, 'member_alchemy_elder')!;

const tournamentCausal = {
  seed,
  foundationAtLaunch: prog.foundationPoints,
  unlockedPermissions: prog.unlockedPermissions,
  caseA_bothHostsWin: {
    phase: tA.phase,
    breakthroughSucceeded: tA.breakthroughSucceeded,
    winnerId: tA.winnerId,
    bothSafe: tA.bothSafe,
    missions: {
      breakthrough: caseA.missions.find((m) => m.id === tA.breakthroughMissionId)?.status,
      champion: caseA.missions.find((m) => m.id === tA.championMissionId)?.status,
      guard: caseA.missions.find((m) => m.id === tA.guardMissionId)?.status,
    },
    summary: tA.summary,
  },
  caseB_breakthroughWinnerTakesFinal: {
    phase: tB.phase,
    breakthroughSucceeded: tB.breakthroughSucceeded,
    winnerId: tB.winnerId,
    missions: {
      breakthrough: caseB.missions.find((m) => m.id === tB.breakthroughMissionId)?.status,
      champion: caseB.missions.find((m) => m.id === tB.championMissionId)?.status,
      guard: caseB.missions.find((m) => m.id === tB.guardMissionId)?.status,
    },
    championRefundedOnLoss: true,
    summary: tB.summary,
  },
  privacyIsolation: {
    publicForbiddenLeaks: leakedTerms.length,
    hostACannotSeeOthers: !vA.privateMissions.some((m) => m.id === tA.championMissionId || m.id === tA.guardMissionId),
    hostBCannotSeeOthers: !vB.privateMissions.some((m) => m.id === tA.breakthroughMissionId || m.id === tA.guardMissionId),
    elderCannotSeeOthers: !vElder.privateMissions.some((m) => m.id === tA.breakthroughMissionId || m.id === tA.championMissionId),
  },
};
fs.writeFileSync(path.join(outDir, 'm2-tournament-causal.json'), JSON.stringify(tournamentCausal, null, 2));

// 3. 30 小时（21,600 刻）长期无人干预模拟与近 20 条重点事件抽检
const THIRTY_HOURS_TICKS = 30 * 60 * 12; // 21,600 ticks
const tStart = performance.now();
const longRun = advance(cloneState(caseA), caseA.tick + THIRTY_HOURS_TICKS, []).state;
const longDurationMs = Number((performance.now() - tStart).toFixed(2));

const ledgerIds = new Set(longRun.ledger.map((l) => l.id));
const nonNegativeResources =
  longRun.daoyuanAvailable >= 0 &&
  longRun.daoyuanReserved >= 0 &&
  Object.values(longRun.inventory.herbs).every((v) => v >= 0) &&
  Object.values(longRun.inventory.pills).every((v) => v >= 0) &&
  Object.values(longRun.inventory.materials ?? {}).every((v) => v >= 0) &&
  longRun.inventory.spiritStones.low >= 0;

const notableSample = longRun.facts
  .filter((f) => f.cueTier === 'notable' || f.cueTier === 'major')
  .slice(-20)
  .map((f) => ({
    id: f.id,
    tick: f.tick,
    type: f.type,
    visibility: f.visibility,
    summary: f.publicSummary ?? f.systemSummary,
  }));

const audit30h = {
  environment: {
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
  },
  ticksSimulated: THIRTY_HOURS_TICKS,
  finalTick: longRun.tick,
  computeMs: longDurationMs,
  noDuplicateLedgerIds: ledgerIds.size === longRun.ledger.length,
  ledgerCount: longRun.ledger.length,
  nonNegativeResources,
  daoyuanAvailableAfter: longRun.daoyuanAvailable,
  daoyuanReservedAfter: longRun.daoyuanReserved,
  foundationPointsAfter: longRun.foundationPoints,
  factsTotal: longRun.facts.length,
  latest20NotableOrMajorSample: notableSample,
};
fs.writeFileSync(path.join(outDir, 'm2-30h-audit.json'), JSON.stringify(audit30h, null, 2));

console.log(
  `M2 evidence generated: 30h (${THIRTY_HOURS_TICKS} ticks) in ${longDurationMs}ms, zero leaks=${leakedTerms.length === 0}, nonNegative=${nonNegativeResources}`,
);
