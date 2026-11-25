import type { DramaScene, Fact, FactType, FactVisibility, WorldState } from './types';

export interface AppendFactInput {
  type: FactType;
  visibility: FactVisibility;
  recipientId: string | null;
  actorIds: string[];
  missionId?: string;
  causeIds?: string[];
  publicSummary: string | null;
  privateSummary: string | null;
  systemSummary: string;
  details?: string;
  battleFactId?: string;
  alchemyFactId?: string;
  cueTier?: Fact['cueTier'];
}

export function appendFact(state: WorldState, input: AppendFactInput): Fact {
  const seq = state.nextFactSeq;
  state.nextFactSeq += 1;
  const fact: Fact = {
    id: `fact_${seq}`,
    seq,
    tick: state.tick,
    type: input.type,
    visibility: input.visibility,
    recipientId: input.recipientId,
    actorIds: input.actorIds,
    missionId: input.missionId,
    causeIds: input.causeIds ?? [],
    publicSummary: input.publicSummary,
    privateSummary: input.privateSummary,
    systemSummary: input.systemSummary,
    details: input.details,
    battleFactId: input.battleFactId,
    alchemyFactId: input.alchemyFactId,
    cueTier: input.cueTier ?? 'routine',
  };
  state.facts.push(fact);
  return fact;
}

export function appendDramaScene(
  state: WorldState,
  scene: Omit<DramaScene, 'id' | 'tick'>,
): DramaScene {
  state.dramaLogs ??= [];
  const entry: DramaScene = {
    id: `drama_${state.tick}_${state.dramaLogs.length + 1}`,
    tick: state.tick,
    ...scene,
  };
  state.dramaLogs.push(entry);
  return entry;
}

export function nextEntityId(state: WorldState, prefix: string): string {
  const seq = state.nextEntitySeq;
  state.nextEntitySeq += 1;
  return `${prefix}_${seq}`;
}

function pruneDetailRecord<T>(
  dict: Record<string, T> | undefined,
  referencedIds: Set<string>,
  maxEntries = 60,
  keepLatest = 20,
): Record<string, T> | undefined {
  if (!dict) return dict;
  const keys = Object.keys(dict);
  if (keys.length <= maxEntries) return dict;
  const recentSet = new Set(keys.slice(-keepLatest));
  const next: Record<string, T> = {};
  for (const k of keys) {
    if (referencedIds.has(k) || recentSet.has(k)) {
      next[k] = dict[k];
    }
  }
  return next;
}

/**
 * 确定性裁剪超长历史记录（保留 UI 与因果链路所需窗口，防止长时间挂机后存档/哈希膨胀至数兆）。
 */
export function pruneWorldHistory(state: WorldState): void {
  if (state.facts.length > 300) {
    state.facts = state.facts.slice(-300);
  }

  const refBattleIds = new Set<string>();
  const refAlchemyIds = new Set<string>();
  for (const f of state.facts) {
    if (f.battleFactId) refBattleIds.add(f.battleFactId);
    if (f.alchemyFactId) refAlchemyIds.add(f.alchemyFactId);
  }
  state.battleFacts = pruneDetailRecord(state.battleFacts, refBattleIds) ?? {};
  state.alchemyFacts = pruneDetailRecord(state.alchemyFacts, refAlchemyIds) ?? {};
  state.forgingFacts = pruneDetailRecord(state.forgingFacts, new Set());
  state.beastFacts = pruneDetailRecord(state.beastFacts, new Set());

  const activeMissionIds = new Set<string>();
  const tournamentMissionIds = new Set<string>();
  for (const t of state.tournaments ?? []) {
    if (t.breakthroughMissionId) tournamentMissionIds.add(t.breakthroughMissionId);
    if (t.championMissionId) tournamentMissionIds.add(t.championMissionId);
    if (t.guardMissionId) tournamentMissionIds.add(t.guardMissionId);
  }

  if (state.missions.length > 160) {
    const keepMissionIds = new Set<string>();
    const terminalIds: string[] = [];
    let latestPlayerBountyId: string | null = null;
    let latestCompletedPlayerBountyId: string | null = null;

    for (const m of state.missions) {
      if (m.source === 'player_bounty') {
        latestPlayerBountyId = m.id;
        if (m.status === 'completed') latestCompletedPlayerBountyId = m.id;
      }
      if (m.status === 'issued' || m.status === 'accepted') {
        activeMissionIds.add(m.id);
        keepMissionIds.add(m.id);
      } else if (tournamentMissionIds.has(m.id)) {
        keepMissionIds.add(m.id);
      } else {
        terminalIds.push(m.id);
      }
    }
    if (latestPlayerBountyId) keepMissionIds.add(latestPlayerBountyId);
    if (latestCompletedPlayerBountyId) keepMissionIds.add(latestCompletedPlayerBountyId);
    for (const id of terminalIds.slice(-100)) {
      keepMissionIds.add(id);
    }
    state.missions = state.missions.filter((m) => keepMissionIds.has(m.id));
  } else {
    for (const m of state.missions) {
      if (m.status === 'issued' || m.status === 'accepted') {
        activeMissionIds.add(m.id);
      }
    }
  }

  if (state.ledger.length > 260) {
    const cutoff = state.ledger.length - 200;
    state.ledger = state.ledger.filter(
      (entry, idx) => idx >= cutoff || activeMissionIds.has(entry.settlementId),
    );
  }

  if (state.dramaLogs && state.dramaLogs.length > 30) {
    state.dramaLogs = state.dramaLogs.slice(-30);
  }

  const receiptKeys = Object.keys(state.receipts);
  if (receiptKeys.length > 220) {
    const nextReceipts: WorldState['receipts'] = {};
    for (const k of receiptKeys.slice(-160)) {
      nextReceipts[k] = state.receipts[k];
    }
    state.receipts = nextReceipts;
  }

  for (const m of state.members) {
    if (m.notes && m.notes.length > 50) {
      m.notes = m.notes.slice(-40);
    }
  }

  if (state.inventory.weapons.length > 80) {
    state.inventory.weapons = [...state.inventory.weapons]
      .sort(
        (a, b) =>
          b.attackBonus + b.defenseBonus - (a.attackBonus + a.defenseBonus) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 80);
  }

  if (state.tournaments && state.tournaments.length > 20) {
    const activeTournaments = state.tournaments.filter((t) => t.phase !== 'settled');
    const endedTournaments = state.tournaments
      .filter((t) => t.phase === 'settled')
      .slice(-12);
    state.tournaments = [...endedTournaments, ...activeTournaments];
  }
}
