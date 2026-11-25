import Dexie from 'dexie';
import { CONTENT_VERSION, RNG_VERSION, RULES_VERSION, SCHEMA_VERSION } from '../sim/constants';
import { pruneWorldHistory } from '../sim/facts';
import { hashCanonical } from '../sim/hash';
import { createClockAnchor } from '../sim/time';
import type { ClockAnchor, Fact, LedgerEntry, SaveEnvelope, CommandReceipt, WorldState } from '../sim/types';
import { createInitialWorld } from '../sim/worldgen';
import { defaultDb, type SectDatabase, type SnapshotRow } from './db';

export function upgradeWorldSnapshot(raw: WorldState): WorldState {
  const needsUpgrade =
    (raw.schemaVersion ?? 1) < SCHEMA_VERSION ||
    !raw.forgingFacts ||
    !raw.beastFacts ||
    !raw.spiritBeasts ||
    !raw.tournaments ||
    !('activePhenomenon' in raw);

  const defaultBeasts = createInitialWorld(raw.seed ?? 20261123).spiritBeasts ?? [];

  const upgraded: WorldState = {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: needsUpgrade ? RULES_VERSION : raw.rulesVersion || RULES_VERSION,
    contentVersion: needsUpgrade ? CONTENT_VERSION : raw.contentVersion || CONTENT_VERSION,
    rngVersion: raw.rngVersion || RNG_VERSION,
    inventory: {
      ...raw.inventory,
      furnaceHasWarmCore: raw.inventory?.furnaceHasWarmCore ?? false,
      materials: {
        mat_chaowen_jade: 3,
        ...(raw.inventory?.materials ?? {}),
      },
    },
    members: (raw.members ?? []).map((m) => ({
      ...m,
      grantedAbilities: m.grantedAbilities ?? [],
      bondedBeastId: m.bondedBeastId ?? null,
    })),
    spiritBeasts: raw.spiritBeasts ?? defaultBeasts,
    forgingFacts: { ...(raw.forgingFacts ?? {}) },
    beastFacts: { ...(raw.beastFacts ?? {}) },
    battleFacts: { ...(raw.battleFacts ?? {}) },
    alchemyFacts: { ...(raw.alchemyFacts ?? {}) },
    facts: [...(raw.facts ?? [])],
    ledger: [...(raw.ledger ?? [])],
    missions: [...(raw.missions ?? [])],
    receipts: { ...(raw.receipts ?? {}) },
    tournaments: raw.tournaments ?? [],
    activePhenomenon: raw.activePhenomenon ?? null,
    conquestStage: raw.conquestStage ?? 0,
    autoDispatchEnabled: raw.autoDispatchEnabled ?? false,
    sectSpiritVeinLevel: raw.sectSpiritVeinLevel ?? 1,
    pendingEncounter: raw.pendingEncounter ?? null,
    resolvedEncounterCount: raw.resolvedEncounterCount ?? 0,
  };

  if (
    upgraded.facts.length > 300 ||
    upgraded.ledger.length > 260 ||
    upgraded.missions.length > 160 ||
    upgraded.inventory.weapons.length > 80 ||
    (upgraded.tournaments?.length ?? 0) > 20 ||
    upgraded.members.some((m) => (m.notes?.length ?? 0) > 50)
  ) {
    pruneWorldHistory(upgraded);
  }
  return upgraded;
}

export const DEFAULT_SAVE_ID = 'sect-main-slot';

export class SaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveConflictError';
  }
}

export class SaveCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCorruptionError';
  }
}

export function computeSaveChecksum(payload: {
  saveId: string;
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  rngVersion: string;
  revision: number;
  clockAnchor: ClockAnchor;
  seed: number;
  snapshot: WorldState;
}): string {
  return hashCanonical(payload);
}

export function buildSaveEnvelope(
  saveId: string,
  revision: number,
  writerEpoch: number,
  clockAnchor: ClockAnchor,
  snapshot: WorldState,
): SaveEnvelope {
  const core = {
    saveId,
    schemaVersion: snapshot.schemaVersion,
    rulesVersion: snapshot.rulesVersion,
    contentVersion: snapshot.contentVersion,
    rngVersion: snapshot.rngVersion,
    revision,
    clockAnchor,
    seed: snapshot.seed,
    snapshot,
  };
  return {
    ...core,
    writerEpoch,
    checksum: computeSaveChecksum(core),
  };
}

export function verifySaveEnvelope(envelope: SaveEnvelope): boolean {
  if (
    !envelope ||
    typeof envelope.saveId !== 'string' ||
    typeof envelope.revision !== 'number' ||
    !envelope.snapshot ||
    !envelope.clockAnchor
  ) {
    return false;
  }
  const expected = computeSaveChecksum({
    saveId: envelope.saveId,
    schemaVersion: envelope.schemaVersion,
    rulesVersion: envelope.rulesVersion,
    contentVersion: envelope.contentVersion,
    rngVersion: envelope.rngVersion,
    revision: envelope.revision,
    clockAnchor: envelope.clockAnchor,
    seed: envelope.seed,
    snapshot: envelope.snapshot,
  });
  return expected === envelope.checksum;
}

async function withSaveLock<T>(db: SectDatabase, saveId: string, writerEpoch: number, fn: () => Promise<T>): Promise<T> {
  const navLocks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (navLocks && typeof navLocks.request === 'function') {
    return navLocks.request(`xiuzhen-save:${saveId}`, async () => fn());
  }
  // 租约回退方案
  const ownerId = `writer-${writerEpoch}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  await db.transaction('rw', db.leases, async () => {
    const existing = await db.leases.get(saveId);
    if (existing && existing.expiresAt > now && existing.writerEpoch > writerEpoch) {
      throw new SaveConflictError(`过期写者代号 ${writerEpoch} 被阻止，当前持有者为 ${existing.writerEpoch}`);
    }
    await db.leases.put({
      saveId,
      ownerId,
      writerEpoch,
      expiresAt: now + 10_000,
    });
  });
  try {
    return await fn();
  } finally {
    await db.leases.where('saveId').equals(saveId).and((l) => l.ownerId === ownerId).delete();
  }
}

export class SaveRepository {
  constructor(private readonly db: SectDatabase = defaultDb) {}

  async acquireWriterEpoch(saveId = DEFAULT_SAVE_ID): Promise<number> {
    return this.db.transaction('rw', this.db.saves, async () => {
      const meta = await this.db.saves.get(saveId);
      const nextEpoch = (meta?.writerEpoch ?? 0) + 1;
      if (meta) {
        await this.db.saves.update(saveId, { writerEpoch: nextEpoch });
      }
      return nextEpoch;
    });
  }

  async loadOrCreate(
    saveId = DEFAULT_SAVE_ID,
    defaultSeed = 20261123,
    nowMs = Date.now(),
  ): Promise<SaveEnvelope> {
    const existing = await this.loadValidEnvelope(saveId);
    if (existing) {
      const nextEpoch = await this.acquireWriterEpoch(saveId);
      return {
        ...existing,
        writerEpoch: nextEpoch,
      };
    }

    const initialWorld = createInitialWorld(defaultSeed);
    const clockAnchor = createClockAnchor(nowMs, 0);
    const envelope = buildSaveEnvelope(saveId, 1, 1, clockAnchor, initialWorld);
    await this.writeInitialEnvelope(envelope);
    return envelope;
  }

  async resetWorld(
    saveId = DEFAULT_SAVE_ID,
    newSeed = 20261123,
    nowMs = Date.now(),
  ): Promise<SaveEnvelope> {
    const nextEpoch = (await this.acquireWriterEpoch(saveId)) + 1;
    await this.db.transaction(
      'rw',
      [this.db.saves, this.db.snapshots, this.db.facts, this.db.ledger, this.db.receipts],
      async () => {
        await this.db.saves.where('saveId').equals(saveId).delete();
        await this.db.snapshots.where('saveId').equals(saveId).delete();
        await this.db.facts.where('saveId').equals(saveId).delete();
        await this.db.ledger.where('saveId').equals(saveId).delete();
        await this.db.receipts.where('saveId').equals(saveId).delete();
      },
    );
    const world = createInitialWorld(newSeed);
    const clockAnchor = createClockAnchor(nowMs, 0);
    const envelope = buildSaveEnvelope(saveId, 1, nextEpoch, clockAnchor, world);
    await this.writeInitialEnvelope(envelope);
    return envelope;
  }

  private async writeInitialEnvelope(envelope: SaveEnvelope): Promise<void> {
    const { saveId, revision, writerEpoch, clockAnchor, snapshot, checksum } = envelope;
    await this.db.transaction('rw', [this.db.saves, this.db.snapshots], async () => {
      await this.db.saves.put({
        saveId,
        activeRevision: revision,
        writerEpoch,
        seed: snapshot.seed,
        sectName: snapshot.sectName,
        worldTick: snapshot.tick,
        clockAnchor,
        updatedAt: clockAnchor.lastWallClockMs,
      });
      await this.db.snapshots.put({
        saveId,
        revision,
        schemaVersion: snapshot.schemaVersion,
        rulesVersion: snapshot.rulesVersion,
        contentVersion: snapshot.contentVersion,
        rngVersion: snapshot.rngVersion,
        clockAnchor,
        snapshot,
        checksum,
        createdAt: clockAnchor.lastWallClockMs,
      });
    });
  }

  async loadValidEnvelope(saveId = DEFAULT_SAVE_ID): Promise<SaveEnvelope | null> {
    const meta = await this.db.saves.get(saveId);
    if (!meta) {
      return null;
    }
    const rows = await this.db.snapshots
      .where('[saveId+revision]')
      .between([saveId, Dexie.minKey], [saveId, Dexie.maxKey])
      .reverse()
      .toArray();
    for (const row of rows) {
      if (row.schemaVersion > SCHEMA_VERSION) {
        throw new SaveCorruptionError(`存档版本 ${row.schemaVersion} 高于当前支持版本 ${SCHEMA_VERSION}。`);
      }
      const candidate: SaveEnvelope = {
        saveId: row.saveId,
        schemaVersion: row.schemaVersion,
        rulesVersion: row.rulesVersion,
        contentVersion: row.contentVersion,
        rngVersion: row.rngVersion,
        revision: row.revision,
        writerEpoch: meta.writerEpoch,
        clockAnchor: row.clockAnchor,
        seed: row.snapshot.seed,
        snapshot: row.snapshot,
        checksum: row.checksum,
      };
      if (verifySaveEnvelope(candidate)) {
        const needsHistoryPrune =
          candidate.snapshot.facts.length > 300 ||
          candidate.snapshot.ledger.length > 260 ||
          candidate.snapshot.missions.length > 160 ||
          candidate.snapshot.inventory.weapons.length > 80 ||
          (candidate.snapshot.tournaments?.length ?? 0) > 20 ||
          candidate.snapshot.members.some((m) => (m.notes?.length ?? 0) > 50);
        if (candidate.schemaVersion < SCHEMA_VERSION || needsHistoryPrune) {
          return {
            ...candidate,
            snapshot: upgradeWorldSnapshot(candidate.snapshot),
          };
        }
        return candidate;
      }
    }
    throw new SaveCorruptionError('所有最近快照均未通过校验和验证，请联系备份或导出最近有效 JSON。');
  }

  async commitRevision(params: {
    saveId: string;
    expectedRevision: number;
    writerEpoch: number;
    clockAnchor: ClockAnchor;
    nextState: WorldState;
    newFacts: Fact[];
    newLedgerEntries: LedgerEntry[];
    newReceipts: CommandReceipt[];
  }): Promise<SaveEnvelope> {
    const { saveId, expectedRevision, writerEpoch, clockAnchor, nextState } = params;

    return withSaveLock(this.db, saveId, writerEpoch, async () => {
      return this.db.transaction('rw', [this.db.saves, this.db.snapshots], async () => {
          const meta = await this.db.saves.get(saveId);
          if (!meta) {
            throw new SaveConflictError(`存档槽 ${saveId} 不存在。`);
          }
          if (meta.writerEpoch > writerEpoch) {
            throw new SaveConflictError(
              `写者代号过期（当前为 ${meta.writerEpoch}，请求为 ${writerEpoch}），拒绝覆盖提交。`,
            );
          }
          if (meta.activeRevision !== expectedRevision) {
            throw new SaveConflictError(
              `修订号冲突（期待 ${expectedRevision}，实际 ${meta.activeRevision}）。`,
            );
          }

          const nextRevision = expectedRevision + 1;
          const envelope = buildSaveEnvelope(saveId, nextRevision, writerEpoch, clockAnchor, nextState);

          await this.db.snapshots.put({
            saveId,
            revision: nextRevision,
            schemaVersion: envelope.schemaVersion,
            rulesVersion: envelope.rulesVersion,
            contentVersion: envelope.contentVersion,
            rngVersion: envelope.rngVersion,
            clockAnchor,
            snapshot: nextState,
            checksum: envelope.checksum,
            createdAt: clockAnchor.lastWallClockMs,
          });

          // 保留最近两代有效快照
          const allSnapshots: SnapshotRow[] = await this.db.snapshots
            .where('saveId')
            .equals(saveId)
            .sortBy('revision');
          if (allSnapshots.length > 2) {
            const toDelete = allSnapshots.slice(0, allSnapshots.length - 2);
            for (const oldSnap of toDelete) {
              await this.db.snapshots.delete([saveId, oldSnap.revision]);
            }
          }

          await this.db.saves.put({
            saveId,
            activeRevision: nextRevision,
            writerEpoch,
            seed: nextState.seed,
            sectName: nextState.sectName,
            worldTick: nextState.tick,
            clockAnchor,
            updatedAt: clockAnchor.lastWallClockMs,
          });

          return envelope;
        },
      );
    });
  }

  async exportEnvelope(saveId = DEFAULT_SAVE_ID): Promise<SaveEnvelope> {
    const env = await this.loadValidEnvelope(saveId);
    if (!env) {
      throw new Error(`未找到可导出的存档 ${saveId}`);
    }
    return env;
  }

  async importEnvelope(raw: SaveEnvelope | string, targetSaveId = DEFAULT_SAVE_ID): Promise<SaveEnvelope> {
    const parsed: SaveEnvelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!verifySaveEnvelope(parsed)) {
      throw new SaveCorruptionError('导入文件校验和验证失败，原存档保持不变。');
    }
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      throw new SaveCorruptionError(`暂不支持更高版本存档 (${parsed.schemaVersion})。`);
    }

    const currentMeta = await this.db.saves.get(targetSaveId);
    const nextEpoch = (currentMeta?.writerEpoch ?? 0) + 1;
    const nextRevision = (currentMeta?.activeRevision ?? 0) + 1;

    const normalizedSnapshot = upgradeWorldSnapshot(parsed.snapshot);

    const rekeyed = buildSaveEnvelope(
      targetSaveId,
      nextRevision,
      nextEpoch,
      parsed.clockAnchor,
      normalizedSnapshot,
    );

    await this.db.transaction(
      'rw',
      [this.db.saves, this.db.snapshots, this.db.facts, this.db.ledger, this.db.receipts],
      async () => {
        await this.db.facts.where('saveId').equals(targetSaveId).delete();
        await this.db.ledger.where('saveId').equals(targetSaveId).delete();
        await this.db.receipts.where('saveId').equals(targetSaveId).delete();
        await this.db.snapshots.where('saveId').equals(targetSaveId).delete();
      },
    );
    await this.writeInitialEnvelope(rekeyed);
    return rekeyed;
  }
}
