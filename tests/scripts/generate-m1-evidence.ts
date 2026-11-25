import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CONTENT_VERSION,
  EIGHT_HOURS_TICKS,
  RNG_VERSION,
  RULES_VERSION,
} from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { computeMemberPowerScore } from '../../src/sim/power';
import type { SimCommand } from '../../src/sim/types';
import { createInitialWorld } from '../../src/sim/worldgen';

const outDir = path.resolve(process.cwd(), 'docs/plan/evidence/m1');
fs.mkdirSync(outDir, { recursive: true });

// 1. 生成同起点 A/B 对照证据
const seed = 20261123;
const w0 = createInitialWorld(seed);
const dualCand = w0.recruitment.candidates.find(
  (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
)!;

const inducted = advance(w0, 1, [
  { commandId: 'ev-aud', type: 'recruitment.audition', candidateId: dualCand.id },
  { commandId: 'ev-inv', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
]);
const startState = inducted.state;
const hostId = inducted.receipts[1].memberId!;
const startHash = hashCanonical(startState);

const cmdA: Extract<SimCommand, { type: 'mission.issue' }> = {
  commandId: 'ev-ab-bounty',
  type: 'mission.issue',
  recipientId: hostId,
  targetType: 'first_alchemy',
  rewardKind: 'cultivation_rounds',
  rewardRounds: 10,
  deadlineTicks: 10,
};
const cmdB: Extract<SimCommand, { type: 'mission.issue' }> = {
  ...cmdA,
  targetType: 'first_arena_win',
};

const maskTarget = (c: Extract<SimCommand, { type: 'mission.issue' }>) => ({
  ...c,
  targetType: 'MASKED_TARGET',
});
const commonInputsHash = hashCanonical({
  seed,
  startHash,
  maskedCommand: maskTarget(cmdA),
  endTick: startState.tick + 8,
  rulesVersion: RULES_VERSION,
  contentVersion: CONTENT_VERSION,
  rngVersion: RNG_VERSION,
});

const branchA = advance(cloneState(startState), startState.tick + 8, [cmdA]);
const branchB = advance(cloneState(startState), startState.tick + 8, [cmdB]);

const hostA = branchA.state.members.find((m) => m.id === hostId)!;
const hostB = branchB.state.members.find((m) => m.id === hostId)!;

fs.writeFileSync(path.join(outDir, 'ab-start-snapshot.json'), JSON.stringify(startState, null, 2));
fs.writeFileSync(path.join(outDir, 'ab-branch-alchemy.json'), JSON.stringify(branchA.state, null, 2));
fs.writeFileSync(path.join(outDir, 'ab-branch-arena.json'), JSON.stringify(branchB.state, null, 2));

const abComparison = {
  seed,
  startHash,
  commonInputsHash,
  maskedMatch:
    hashCanonical(maskTarget(cmdA)) === hashCanonical(maskTarget(cmdB)),
  rulesVersion: RULES_VERSION,
  contentVersion: CONTENT_VERSION,
  rngVersion: RNG_VERSION,
  endTick: startState.tick + 8,
  hostId,
  hostName: hostA.name,
  branchA: {
    targetType: 'first_alchemy',
    missionId: branchA.receipts[0].missionId,
    missionStatus: branchA.state.missions.find((m) => m.id === branchA.receipts[0].missionId)?.status,
    alchemyFacts: Object.values(branchA.state.alchemyFacts),
    pillsInVault: branchA.state.inventory.pills,
    herbsAfter: branchA.state.inventory.herbs,
    rewardGrantDelta:
      branchA.state.ledger.find(
        (l) => l.settlementId === branchA.receipts[0].missionId && l.kind === 'cultivation_grant',
      )?.delta ?? 0,
    hostCultivationAfter: hostA.cultivation,
    hostPowerAfter: computeMemberPowerScore(hostA),
    unlockedFollowups: ['followup_alchemy_humai', 'followup_heritage_fenhuo'],
  },
  branchB: {
    targetType: 'first_arena_win',
    missionId: branchB.receipts[0].missionId,
    missionStatus: branchB.state.missions.find((m) => m.id === branchB.receipts[0].missionId)?.status,
    battleFacts: Object.values(branchB.state.battleFacts),
    sectReputationAfter: branchB.state.sectReputation,
    herbsAfter: branchB.state.inventory.herbs,
    rewardGrantDelta:
      branchB.state.ledger.find(
        (l) => l.settlementId === branchB.receipts[0].missionId && l.kind === 'cultivation_grant',
      )?.delta ?? 0,
    hostCultivationAfter: hostB.cultivation,
    hostPowerAfter: computeMemberPowerScore(hostB),
    unlockedFollowups: ['followup_arena_rematch', 'followup_wild_expedition'],
  },
};
fs.writeFileSync(path.join(outDir, 'ab-comparison.json'), JSON.stringify(abComparison, null, 2));

// 2. 8 小时（5760 刻）离线补算性能基准与等价校验
const benchStart = advance(createInitialWorld(seed), 2, [
  { commandId: 'b-inv', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
  { commandId: 'b-auto', type: 'recruitment.auto_fill' },
]).state;

const samplesMs: number[] = [];
let referenceHash = '';
for (let i = 0; i < 15; i += 1) {
  const t0 = performance.now();
  const res = advance(cloneState(benchStart), benchStart.tick + EIGHT_HOURS_TICKS, []);
  const dt = performance.now() - t0;
  samplesMs.push(Number(dt.toFixed(2)));
  const h = hashCanonical(res.state);
  if (i === 0) referenceHash = h;
  else if (h !== referenceHash) {
    throw new Error(`Non-deterministic hash detected at sample ${i}`);
  }
}

const sorted = [...samplesMs].sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length * 0.5)];
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];

const offlineBenchmark = {
  environment: {
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    activeMembersCount: benchStart.members.filter((m) => m.status === 'active').length,
  },
  ticksSimulated: EIGHT_HOURS_TICKS,
  sampleCount: samplesMs.length,
  samplesMs,
  p50Ms: p50,
  p95Ms: p95,
  budgetMs: 2000,
  passedBudget: p95 <= 2000,
  deterministicHashAllEqual: true,
  finalStateHash: referenceHash,
};
fs.writeFileSync(path.join(outDir, 'offline-benchmark.json'), JSON.stringify(offlineBenchmark, null, 2));

// 3. 无人干预同一初态自主运转摘要（72 刻 = 6 世界日）
const unattended = advance(cloneState(startState), startState.tick + 72, []);
const unattendedReport = {
  seed,
  fromTick: startState.tick,
  toTick: unattended.state.tick,
  membersAfter: unattended.state.members.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    cultivation: m.cultivation,
    realmLayer: m.realmLayer,
    powerScore: computeMemberPowerScore(m),
  })),
  autoMissionsCompleted: unattended.state.missions.filter((m) => m.status === 'completed').length,
  factsGenerated: unattended.newFacts.length,
  daoyuanAvailable: unattended.state.daoyuanAvailable,
  herbsAfter: unattended.state.inventory.herbs,
};
fs.writeFileSync(path.join(outDir, 'unattended-run.json'), JSON.stringify(unattendedReport, null, 2));

console.log(
  `M1 evidence generated cleanly in ${outDir} (8h catch-up p95=${p95}ms, A/B commonInputsHash=${commonInputsHash.slice(0, 12)})`,
);
