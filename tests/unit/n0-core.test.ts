import { describe, expect, it } from 'vitest';
import rawActivityBubbles from '../../src/content/activity_bubbles.json';
import rawMapBubbles from '../../src/content/map_bubbles.json';
import { validateContentIntegrity } from '../../src/content/validate';
import { advance } from '../../src/sim/engine';
import { PRNG_LOCKED_VECTOR, createStreamRng } from '../../src/sim/prng';
import { createClockAnchor } from '../../src/sim/time';
import { createInitialWorld } from '../../src/sim/worldgen';
import { SectDatabase } from '../../src/storage/db';
import { SaveCorruptionError, SaveRepository } from '../../src/storage/repository';

describe('N0 最小内核、校验与 Dexie 存读', () => {
  it('PRNG 锁定测试向量应跨环境保持完全一致', () => {
    const rng = createStreamRng(
      PRNG_LOCKED_VECTOR.worldSeed,
      PRNG_LOCKED_VECTOR.domain,
      PRNG_LOCKED_VECTOR.scopeId,
      PRNG_LOCKED_VECTOR.attemptIndex,
    );
    const out = [rng.nextInt(1, 100), rng.nextInt(1, 100), rng.nextInt(1, 100), rng.nextInt(1, 100), rng.nextInt(1, 100)];
    expect(out).toEqual([...PRNG_LOCKED_VECTOR.expectedInts]);
  });

  it('内容包 Schema、交叉引用与世界观红线校验通过', () => {
    const res = validateContentIntegrity();
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('工作专属气泡与地图气泡完整覆盖 8 类行为，不含省略号与下雨冲突词', () => {
    const requiredActivities = [
      'idle_cultivate',
      'alchemy',
      'forging',
      'arena',
      'beast_expedition',
      'expedition',
      'recover',
      'study_method',
      'breakthrough',
    ];
    for (const kind of requiredActivities) {
      const count = rawActivityBubbles.filter((b) => b.activity === kind).length;
      expect(count).toBeGreaterThanOrEqual(6);
    }
    expect(rawActivityBubbles.filter((b) => b.activity === 'idle_cultivate').length).toBeGreaterThanOrEqual(30);

    for (const item of [...rawActivityBubbles, ...rawMapBubbles]) {
      for (const text of [item.publicBubble, item.secretHostBubble]) {
        expect(text).not.toContain('…');
        expect(text).not.toContain('...');
        expect(text).not.toContain('下雨');
        expect(text.length).toBeLessThanOrEqual(26);
      }
    }
  });

  it('Dexie 存读、两代快照、导出导入往返与防篡改校验有效', async () => {
    const db = new SectDatabase(`test-n0-${Date.now()}`);
    const repo = new SaveRepository(db);

    const env1 = await repo.loadOrCreate('slot-a', 20261123, 1_700_000_000_000);
    expect(env1.snapshot.seed).toBe(20261123);
    expect(env1.snapshot.sectName).not.toBe('云岚宗');

    const adv = advance(env1.snapshot, 12, [
      { commandId: 'cmd-1', type: 'sect.set_focus', focus: 'alchemy' },
    ]);
    const env2 = await repo.commitRevision({
      saveId: 'slot-a',
      expectedRevision: env1.revision,
      writerEpoch: env1.writerEpoch,
      clockAnchor: createClockAnchor(1_700_000_060_000, adv.state.tick),
      nextState: adv.state,
      newFacts: adv.newFacts,
      newLedgerEntries: [],
      newReceipts: adv.receipts,
    });
    expect(env2.revision).toBe(2);

    const exported = await repo.exportEnvelope('slot-a');
    expect(exported.snapshot.tick).toBe(12);
    expect(exported.snapshot.sectFocus).toBe('alchemy');

    // 篡改 JSON 导出校验和应当被拒绝
    const tampered = JSON.parse(JSON.stringify(exported));
    tampered.snapshot.daoyuanAvailable = 9999;
    await expect(repo.importEnvelope(tampered, 'slot-b')).rejects.toThrow(SaveCorruptionError);

    // 合法导出导入应完整恢复
    const imported = await repo.importEnvelope(JSON.stringify(exported), 'slot-b');
    expect(imported.snapshot.tick).toBe(12);
    expect(imported.snapshot.members.map((m) => m.id)).toEqual(
      createInitialWorld(20261123).members.map((m) => m.id),
    );
    await db.delete();
  });
});
