import type { SimCommand } from '../sim/types';
import { DEFAULT_SAVE_ID } from '../storage/repository';
import type { WorkerRequest, WorkerResponse } from './protocol';

type PendingResolver = {
  resolve: (res: Extract<WorkerResponse, { ok: true }>) => void;
  reject: (err: Error) => void;
};

export class SimWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingResolver>();
  private reqSeq = 1;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const entry = this.pending.get(res.id);
      if (!entry) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        entry.resolve(res);
      } else {
        entry.reject(new Error(res.error));
      }
    };
    this.worker.onerror = (err) => {
      for (const [, entry] of this.pending) {
        entry.reject(new Error(err.message || 'Worker 运行出错'));
      }
      this.pending.clear();
    };
  }

  private send(reqBody: DistributiveOmit<WorkerRequest, 'id'>): Promise<Extract<WorkerResponse, { ok: true }>> {
    const id = `req_${this.reqSeq++}`;
    const req = { ...reqBody, id } as WorkerRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(req);
    });
  }

  init(seed?: number, saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'Init', saveId, seed, nowMs: Date.now() });
  }

  resetWorld(seed: number, saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'ResetWorld', saveId, seed, nowMs: Date.now() });
  }

  advanceTo(untilTick: number, saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'AdvanceTo', saveId, untilTick, nowMs: Date.now() });
  }

  catchUpWallClock(saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'CatchUpWallClock', saveId, nowMs: Date.now() });
  }

  submitCommand(command: SimCommand, saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'SubmitCommand', saveId, command, nowMs: Date.now() });
  }

  exportSave(saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'ExportSave', saveId });
  }

  importSave(jsonText: string, saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'ImportSave', saveId, jsonText });
  }

  getRawSnapshot(saveId = DEFAULT_SAVE_ID) {
    return this.send({ type: 'GetRawSnapshot', saveId });
  }

  dispose() {
    this.worker.terminate();
  }
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
