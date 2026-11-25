import type { ClockAnchor, Fact, SimCommand, SystemView, WorldState } from '../sim/types';

export interface CatchUpReport {
  fromTick: number;
  toTick: number;
  ticksSimulated: number;
  wallElapsedMs: number;
  catchUpComputeMs: number;
  autoMissionsIssued: number;
  missionsCompleted: number;
  missionsInProgress: number;
  missionsDeclinedOrExpired: number;
  highlightFacts: Fact[];
  clockWarning: string | null;
}

export type WorkerRequest =
  | { id: string; type: 'Init'; saveId: string; seed?: number; nowMs: number }
  | { id: string; type: 'ResetWorld'; saveId: string; seed: number; nowMs: number }
  | { id: string; type: 'AdvanceTo'; saveId: string; untilTick: number; nowMs: number }
  | { id: string; type: 'CatchUpWallClock'; saveId: string; nowMs: number }
  | { id: string; type: 'SubmitCommand'; saveId: string; command: SimCommand; nowMs: number }
  | { id: string; type: 'ExportSave'; saveId: string }
  | { id: string; type: 'ImportSave'; saveId: string; jsonText: string }
  | { id: string; type: 'GetRawSnapshot'; saveId: string };

export type WorkerResponse =
  | {
      id: string;
      ok: true;
      revision: number;
      writerEpoch: number;
      clockAnchor: ClockAnchor;
      systemView: SystemView;
      newFacts: Fact[];
      catchUpReport?: CatchUpReport;
      pendingCatchUpTicks?: number;
      exportJson?: string;
      rawSnapshot?: WorldState;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };
