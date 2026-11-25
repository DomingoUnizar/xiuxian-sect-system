import { describe, expect, it } from 'vitest';
import { EIGHT_HOURS_TICKS } from '../../src/sim/constants';
import { advance } from '../../src/sim/engine';
import { createClockAnchor } from '../../src/sim/time';
import { SectDatabase } from '../../src/storage/db';
import { buildSaveEnvelope, SaveConflictError, SaveRepository } from '../../src/storage/repository';

describe('N3 Dexie 存储容错：两代快照、损坏回退与过期写者拦截', () => {
  it('仅保留最近两代有效快照，最新快照损坏时自动回退上一代有效档', async () => {
    const db = new SectDatabase(`test-n3-storage-${Date.now()}`);
    const repo = new SaveRepository(db);

    const env1 = await repo.loadOrCreate('slot-s', 20261123, 1_700_000_000_000);
    const s2 = advance(env1.snapshot, 4, []);
    const env2 = await repo.commitRevision({
      saveId: 'slot-s',
      expectedRevision: env1.revision,
      writerEpoch: env1.writerEpoch,
      clockAnchor: createClockAnchor(1_700_000_020_000, 4),
      nextState: s2.state,
      newFacts: s2.newFacts,
      newLedgerEntries: [],
      newReceipts: [],
    });
    const s3 = advance(env2.snapshot, 8, []);
    const env3 = await repo.commitRevision({
      saveId: 'slot-s',
      expectedRevision: env2.revision,
      writerEpoch: env2.writerEpoch,
      clockAnchor: createClockAnchor(1_700_000_040_000, 8),
      nextState: s3.state,
      newFacts: s3.newFacts,
      newLedgerEntries: [],
      newReceipts: [],
    });

    const snaps = await db.snapshots.where('saveId').equals('slot-s').sortBy('revision');
    expect(snaps.map((x) => x.revision)).toEqual([2, 3]);

    // 破坏第 3 代快照校验数据，读取应自动安全回退第 2 代
    await db.snapshots.update(['slot-s', 3], { checksum: 'corrupted-checksum' });
    const recovered = await repo.loadValidEnvelope('slot-s');
    expect(recovered?.revision).toBe(2);
    expect(recovered?.snapshot.tick).toBe(4);

    // 过期写者（epoch=1 < 当前 epoch=2）必须被拒绝提交
    const newEpoch = await repo.acquireWriterEpoch('slot-s');
    expect(newEpoch).toBeGreaterThan(env3.writerEpoch);
    await expect(
      repo.commitRevision({
        saveId: 'slot-s',
        expectedRevision: 3,
        writerEpoch: env3.writerEpoch,
        clockAnchor: createClockAnchor(1_700_000_050_000, 10),
        nextState: env3.snapshot,
        newFacts: [],
        newLedgerEntries: [],
        newReceipts: [],
      }),
    ).rejects.toThrow(SaveConflictError);

    await db.delete();
  });

  it('膨胀旧存档可秒过校验并自动瘦身，且 8 小时（5760 刻）单次落库耗时低于 1.5 秒', async () => {
    const db = new SectDatabase(`test-fast-load-${Date.now()}`);
    const repo = new SaveRepository(db);
    const env1 = await repo.loadOrCreate('slot-fast', 20261123, 1_700_000_000_000);

    // 人为构造含 2000 条 facts 与 800 条 ledger 的臃肿历史存档并写入有效校验和
    const bloated = structuredClone(env1.snapshot);
    for (let i = 0; i < 2000; i += 1) {
      bloated.facts.push({
        id: `bloat_f_${i}`,
        seq: 1000 + i,
        tick: i,
        type: 'cultivation.progressed',
        visibility: 'public',
        recipientId: null,
        actorIds: ['member_master'],
        causeIds: [],
        publicSummary: `第 ${i} 刻吐纳`,
        privateSummary: null,
        systemSummary: `第 ${i} 刻吐纳`,
        cueTier: 'silent',
      });
    }
    for (let i = 0; i < 800; i += 1) {
      bloated.ledger.push({
        id: `bloat_l_${i}`,
        settlementId: `past_${i}`,
        effectIndex: 0,
        tick: i,
        recipientId: 'member_master',
        kind: 'daoyuan_gain',
        delta: 1,
        summary: `流水 ${i}`,
      });
    }
    const bloatedEnv = buildSaveEnvelope(
      'slot-fast',
      2,
      env1.writerEpoch,
      createClockAnchor(1_700_000_000_000, bloated.tick),
      bloated,
    );
    await db.snapshots.put({
      saveId: 'slot-fast',
      revision: 2,
      schemaVersion: bloated.schemaVersion,
      rulesVersion: bloated.rulesVersion,
      contentVersion: bloated.contentVersion,
      rngVersion: bloated.rngVersion,
      clockAnchor: bloatedEnv.clockAnchor,
      snapshot: bloated,
      checksum: bloatedEnv.checksum,
      createdAt: 1_700_000_000_000,
    });
    await db.saves.update('slot-fast', { activeRevision: 2 });

    const loadStart = performance.now();
    const loaded = await repo.loadValidEnvelope('slot-fast');
    const loadMs = performance.now() - loadStart;
    expect(loaded).toBeTruthy();
    expect(loaded!.snapshot.facts.length).toBeLessThanOrEqual(300);
    expect(loaded!.snapshot.ledger.length).toBeLessThanOrEqual(260);
    expect(loadMs).toBeLessThan(800);

    const catchStart = performance.now();
    const sim = advance(loaded!.snapshot, loaded!.snapshot.tick + EIGHT_HOURS_TICKS, []);
    await repo.commitRevision({
      saveId: 'slot-fast',
      expectedRevision: loaded!.revision,
      writerEpoch: loaded!.writerEpoch,
      clockAnchor: createClockAnchor(1_700_028_800_000, sim.state.tick),
      nextState: sim.state,
      newFacts: sim.newFacts,
      newLedgerEntries: [],
      newReceipts: [],
    });
    const catchMs = performance.now() - catchStart;
    expect(catchMs).toBeLessThan(1500);
    expect(sim.state.facts.length).toBeLessThanOrEqual(300);

    await db.delete();
  });
});
