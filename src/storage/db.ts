import Dexie, { type Table } from 'dexie';
import type { ClockAnchor, Fact, LedgerEntry, CommandReceipt, WorldState } from '../sim/types';

export interface SaveMetaRow {
  saveId: string;
  activeRevision: number;
  writerEpoch: number;
  seed: number;
  sectName: string;
  worldTick: number;
  clockAnchor: ClockAnchor;
  updatedAt: number;
}

export interface SnapshotRow {
  saveId: string;
  revision: number;
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  rngVersion: string;
  clockAnchor: ClockAnchor;
  snapshot: WorldState;
  checksum: string;
  createdAt: number;
}

export interface FactRow extends Fact {
  saveId: string;
}

export interface LedgerRow extends LedgerEntry {
  saveId: string;
}

export interface ReceiptRow extends CommandReceipt {
  saveId: string;
}

export interface LeaseRow {
  saveId: string;
  ownerId: string;
  writerEpoch: number;
  expiresAt: number;
}

export class SectDatabase extends Dexie {
  saves!: Table<SaveMetaRow, string>;
  snapshots!: Table<SnapshotRow, [string, number]>;
  facts!: Table<FactRow, [string, number]>;
  ledger!: Table<LedgerRow, [string, string]>;
  receipts!: Table<ReceiptRow, [string, string]>;
  leases!: Table<LeaseRow, string>;

  constructor(dbName = 'xiuzhen-sect-system-v1') {
    super(dbName);
    this.version(1).stores({
      saves: 'saveId, updatedAt',
      snapshots: '[saveId+revision], saveId, revision, createdAt',
      facts: '[saveId+seq], saveId, tick, visibility, recipientId, type',
      ledger: '[saveId+id], saveId, tick, recipientId, settlementId',
      receipts: '[saveId+commandId], saveId, commandId, tick',
      leases: 'saveId, expiresAt',
    });
  }
}

export const defaultDb = new SectDatabase();
