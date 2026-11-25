import { EIGHT_HOURS_TICKS } from '../sim/constants';
import { advance } from '../sim/engine';
import { projectSystemView } from '../sim/projections';
import { computeElapsedTicks, createClockAnchor } from '../sim/time';
import type { ClockAnchor, Fact, LedgerEntry, SaveEnvelope, CommandReceipt, WorldState } from '../sim/types';
import { DEFAULT_SAVE_ID, SaveConflictError, SaveRepository } from '../storage/repository';
import type { CatchUpReport, WorkerRequest, WorkerResponse } from './protocol';

const repo = new SaveRepository();
let activeSaveId = DEFAULT_SAVE_ID;
let currentEnvelope: SaveEnvelope | null = null;

async function ensureLoaded(saveId: string, seed = 20261123, nowMs = Date.now()): Promise<SaveEnvelope> {
  if (currentEnvelope && activeSaveId === saveId) {
    return currentEnvelope;
  }
  activeSaveId = saveId;
  currentEnvelope = await repo.loadOrCreate(saveId, seed, nowMs);
  return currentEnvelope;
}

function buildCatchUpReport(
  fromTick: number,
  toTick: number,
  wallElapsedMs: number,
  computeMs: number,
  newFacts: Fact[],
  state: WorldState,
  clockWarning: string | null,
): CatchUpReport {
  const autoIssued = newFacts.filter((f) => f.type === 'mission.issued').length;
  const completed = newFacts.filter((f) => f.type === 'mission.settled').length;
  const declinedOrExpired = newFacts.filter(
    (f) => f.type === 'mission.declined' || f.type === 'mission.expired',
  ).length;
  const inProgress = state.missions.filter(
    (m) => m.status === 'issued' || m.status === 'accepted',
  ).length;
  const highlights = newFacts.filter(
    (f) =>
      f.type === 'mission.settled' ||
      f.type === 'reward.granted' ||
      f.type === 'heritage.achieved' ||
      f.type === 'system.advanced' ||
      f.type === 'alchemy.finished' ||
      f.type === 'battle.finished' ||
      f.type === 'member.died',
  );

  return {
    fromTick,
    toTick,
    ticksSimulated: Math.max(0, toTick - fromTick),
    wallElapsedMs,
    catchUpComputeMs: computeMs,
    autoMissionsIssued: autoIssued,
    missionsCompleted: completed,
    missionsInProgress: inProgress,
    missionsDeclinedOrExpired: declinedOrExpired,
    highlightFacts: highlights,
    clockWarning,
  };
}

async function advanceOnceAndCommit(
  env: SaveEnvelope,
  untilTick: number,
  nextClockAnchor: ClockAnchor,
  commands: Parameters<typeof advance>[2] = [],
): Promise<{
  envelope: SaveEnvelope;
  allNewFacts: Fact[];
}> {
  const prevLedgerLen = env.snapshot.ledger.length;
  const res = advance(env.snapshot, untilTick, commands);
  const newLedger: LedgerEntry[] = res.state.ledger.slice(prevLedgerLen);
  const newReceipts: CommandReceipt[] = res.receipts;

  const updatedAnchor: ClockAnchor = {
    ...nextClockAnchor,
    worldTick: res.state.tick,
  };

  const workingEnv = await repo.commitRevision({
    saveId: env.saveId,
    expectedRevision: env.revision,
    writerEpoch: env.writerEpoch,
    clockAnchor: updatedAnchor,
    nextState: res.state,
    newFacts: res.newFacts,
    newLedgerEntries: newLedger,
    newReceipts,
  });

  currentEnvelope = workingEnv;
  return {
    envelope: workingEnv,
    allNewFacts: res.newFacts,
  };
}

async function executeWithConflictRecovery(
  saveId: string,
  nowMs: number,
  fn: (env: SaveEnvelope) => Promise<WorkerResponse>,
): Promise<WorkerResponse> {
  const env = await ensureLoaded(saveId, 20261123, nowMs);
  try {
    return await fn(env);
  } catch (err) {
    if (!(err instanceof SaveConflictError)) {
      throw err;
    }
    currentEnvelope = null;
    const freshEnv = await ensureLoaded(saveId, 20261123, nowMs);
    return fn(freshEnv);
  }
}

async function handleRequest(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    if (req.type === 'Init') {
      const env = await ensureLoaded(req.saveId, req.seed ?? 20261123, req.nowMs);
      const elapsed = computeElapsedTicks(env.clockAnchor, req.nowMs);
      const isPausedModal =
        env.snapshot.activeDuel?.status === 'fighting' || Boolean(env.snapshot.pendingClutch);
      const pendingCatchUpTicks = isPausedModal
        ? 0
        : Math.min(elapsed.ticksToAdvance, EIGHT_HOURS_TICKS);

      return {
        id: req.id,
        ok: true,
        revision: env.revision,
        writerEpoch: env.writerEpoch,
        clockAnchor: env.clockAnchor,
        systemView: projectSystemView(env.snapshot),
        newFacts: [],
        pendingCatchUpTicks,
      };
    }

    if (req.type === 'ResetWorld') {
      const env = await repo.resetWorld(req.saveId, req.seed, req.nowMs);
      activeSaveId = req.saveId;
      currentEnvelope = env;
      return {
        id: req.id,
        ok: true,
        revision: env.revision,
        writerEpoch: env.writerEpoch,
        clockAnchor: env.clockAnchor,
        systemView: projectSystemView(env.snapshot),
        newFacts: env.snapshot.facts,
      };
    }

    if (req.type === 'AdvanceTo') {
      return executeWithConflictRecovery(req.saveId, req.nowMs, async (env) => {
        const started = performance.now();
        const targetTick = Math.max(env.snapshot.tick, Math.floor(req.untilTick));
        const nextAnchor: ClockAnchor = {
          ...env.clockAnchor,
          lastWallClockMs: Math.max(env.clockAnchor.lastWallClockMs, req.nowMs),
          worldTick: targetTick,
          clockWarning: null,
        };
        const { envelope, allNewFacts } = await advanceOnceAndCommit(env, targetTick, nextAnchor);
        const computeMs = Math.round(performance.now() - started);
        return {
          id: req.id,
          ok: true,
          revision: envelope.revision,
          writerEpoch: envelope.writerEpoch,
          clockAnchor: {
            ...envelope.clockAnchor,
            lastCatchUpDurationMs: computeMs,
            lastCatchUpTicks: targetTick - env.snapshot.tick,
          },
          systemView: projectSystemView(envelope.snapshot),
          newFacts: allNewFacts,
        };
      });
    }

    if (req.type === 'CatchUpWallClock') {
      return executeWithConflictRecovery(req.saveId, req.nowMs, async (env) => {
        if (env.snapshot.activeDuel?.status === 'fighting' || env.snapshot.pendingClutch) {
          return {
            id: req.id,
            ok: true,
            revision: env.revision,
            writerEpoch: env.writerEpoch,
            clockAnchor: env.clockAnchor,
            systemView: projectSystemView(env.snapshot),
            newFacts: [],
          };
        }
        const elapsed = computeElapsedTicks(env.clockAnchor, req.nowMs);
        const ticksToSimulate = Math.min(elapsed.ticksToAdvance, EIGHT_HOURS_TICKS);
        const fromTick = env.snapshot.tick;
        const started = performance.now();
        const targetTick = fromTick + ticksToSimulate;
        const nextAnchor: ClockAnchor = {
          ...env.clockAnchor,
          lastWallClockMs: elapsed.effectiveNowMs,
          remainderMs: elapsed.nextRemainderMs,
          clockWarning: elapsed.warning,
        };
        if (ticksToSimulate <= 0) {
          return {
            id: req.id,
            ok: true,
            revision: env.revision,
            writerEpoch: env.writerEpoch,
            clockAnchor: nextAnchor,
            systemView: projectSystemView(env.snapshot),
            newFacts: [],
          };
        }
        const { envelope, allNewFacts } = await advanceOnceAndCommit(env, targetTick, nextAnchor);
        const computeMs = Math.round(performance.now() - started);
        const report = buildCatchUpReport(
          fromTick,
          envelope.snapshot.tick,
          Math.max(0, req.nowMs - env.clockAnchor.lastWallClockMs),
          computeMs,
          allNewFacts,
          envelope.snapshot,
          elapsed.warning,
        );
        return {
          id: req.id,
          ok: true,
          revision: envelope.revision,
          writerEpoch: envelope.writerEpoch,
          clockAnchor: envelope.clockAnchor,
          systemView: projectSystemView(envelope.snapshot),
          newFacts: allNewFacts,
          catchUpReport: report,
        };
      });
    }

    if (req.type === 'SubmitCommand') {
      return executeWithConflictRecovery(req.saveId, req.nowMs, async (env) => {
        const nextAnchor: ClockAnchor = {
          ...env.clockAnchor,
          lastWallClockMs: Math.max(env.clockAnchor.lastWallClockMs, req.nowMs),
        };
        const { envelope, allNewFacts } = await advanceOnceAndCommit(
          env,
          env.snapshot.tick,
          nextAnchor,
          [req.command],
        );
        return {
          id: req.id,
          ok: true,
          revision: envelope.revision,
          writerEpoch: envelope.writerEpoch,
          clockAnchor: envelope.clockAnchor,
          systemView: projectSystemView(envelope.snapshot),
          newFacts: allNewFacts,
        };
      });
    }

    if (req.type === 'ExportSave') {
      const env =
        currentEnvelope && activeSaveId === req.saveId
          ? currentEnvelope
          : await repo.exportEnvelope(req.saveId);
      return {
        id: req.id,
        ok: true,
        revision: env.revision,
        writerEpoch: env.writerEpoch,
        clockAnchor: env.clockAnchor,
        systemView: projectSystemView(env.snapshot),
        newFacts: [],
        exportJson: JSON.stringify(env),
      };
    }

    if (req.type === 'ImportSave') {
      const env = await repo.importEnvelope(req.jsonText, req.saveId);
      activeSaveId = req.saveId;
      currentEnvelope = env;
      return {
        id: req.id,
        ok: true,
        revision: env.revision,
        writerEpoch: env.writerEpoch,
        clockAnchor: createClockAnchor(env.clockAnchor.lastWallClockMs, env.snapshot.tick),
        systemView: projectSystemView(env.snapshot),
        newFacts: [],
      };
    }

    if (req.type === 'GetRawSnapshot') {
      const env = await ensureLoaded(req.saveId);
      return {
        id: req.id,
        ok: true,
        revision: env.revision,
        writerEpoch: env.writerEpoch,
        clockAnchor: env.clockAnchor,
        systemView: projectSystemView(env.snapshot),
        newFacts: [],
        rawSnapshot: env.snapshot,
      };
    }

    return {
      id: (req as { id: string }).id,
      ok: false,
      error: '未知 Worker 指令',
    };
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

let workerQueue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  workerQueue = workerQueue
    .then(async () => {
      const response = await handleRequest(event.data);
      self.postMessage(response);
    })
    .catch((err) => {
      self.postMessage({
        id: event.data.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkerResponse);
    });
};
