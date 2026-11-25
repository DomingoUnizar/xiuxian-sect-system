import { createInitialSectCrisis } from './crisis';
import { computeMemberPowerScore } from './power';
import { formatWorldTime } from './time';
import type { HostView, PublicView, SystemView, WorldState } from './types';

export function projectSystemView(state: WorldState): SystemView {
  const wt = formatWorldTime(state.tick);
  return {
    sectName: state.sectName,
    seed: state.seed,
    tick: state.tick,
    day: wt.day,
    shichenIndex: wt.shichenIndex,
    shichenLabel: wt.shichenLabel,
    sectFocus: state.sectFocus,
    sectReputation: state.sectReputation,
    daoyuanAvailable: state.daoyuanAvailable,
    daoyuanReserved: state.daoyuanReserved,
    foundationPoints: state.foundationPoints,
    unlockedPermissions: [...state.unlockedPermissions],
    members: state.members,
    recruitment: state.recruitment,
    inventory: state.inventory,
    arenaOpponents: state.arenaOpponents,
    missions: state.missions,
    reservations: state.reservations,
    ledger: state.ledger,
    facts: state.facts,
    battleFacts: state.battleFacts,
    alchemyFacts: state.alchemyFacts,
    forgingFacts: state.forgingFacts ?? {},
    beastFacts: state.beastFacts ?? {},
    spiritBeasts: state.spiritBeasts ?? [],
    tournaments: state.tournaments ?? [],
    activePhenomenon: state.activePhenomenon ?? null,
    conquestStage: state.conquestStage ?? 0,
    autoDispatchEnabled: state.autoDispatchEnabled ?? false,
    sectSpiritVeinLevel: state.sectSpiritVeinLevel ?? 1,
    pendingEncounter: state.pendingEncounter ?? null,
    resolvedEncounterCount: state.resolvedEncounterCount ?? 0,
    heritages: state.heritages,
    standingBounties: state.standingBounties,
    sectCrisis: state.sectCrisis ?? createInitialSectCrisis(),
    pendingClutch: state.pendingClutch ?? null,
    dramaLogs: state.dramaLogs ?? [],
    activeDuel: state.activeDuel ?? null,
    systemXp: state.systemXp ?? 0,
    systemLevel: state.systemLevel ?? 0,
    activePerks: state.activePerks ?? [],
    pendingPerkChoices: state.pendingPerkChoices ?? null,
  };
}

export function projectHostView(
  state: Pick<WorldState, 'members' | 'missions' | 'ledger' | 'facts' | 'battleFacts' | 'alchemyFacts'>,
  hostId: string,
): HostView | null {
  const host = state.members.find((m) => m.id === hostId);
  if (!host) {
    return null;
  }
  const privateMissions = state.missions.filter((m) => m.recipientId === hostId);
  const privateReceipts = state.ledger.filter((l) => l.recipientId === hostId);
  const visibleFacts = state.facts.filter((f) => {
    if (f.visibility === 'public') {
      return f.publicSummary !== null && f.publicSummary.length > 0;
    }
    if (f.visibility === 'host_private') {
      return f.recipientId === hostId && f.privateSummary !== null && f.privateSummary.length > 0;
    }
    return false;
  });

  const battleFacts: HostView['battleFacts'] = {};
  const alchemyFacts: HostView['alchemyFacts'] = {};
  for (const f of visibleFacts) {
    if (f.battleFactId && state.battleFacts[f.battleFactId]) {
      battleFacts[f.battleFactId] = state.battleFacts[f.battleFactId];
    }
    if (f.alchemyFactId && state.alchemyFacts[f.alchemyFactId]) {
      alchemyFacts[f.alchemyFactId] = state.alchemyFacts[f.alchemyFactId];
    }
  }

  return {
    host,
    privateMissions,
    privateReceipts,
    visibleFacts,
    battleFacts,
    alchemyFacts,
  };
}

export function projectPublicView(
  state: Pick<
    WorldState,
    'sectName' | 'tick' | 'sectReputation' | 'members' | 'facts' | 'battleFacts' | 'alchemyFacts'
  >,
): PublicView {
  const wt = formatWorldTime(state.tick);
  const publicFacts = state.facts
    .filter((f) => f.visibility === 'public' && f.publicSummary !== null)
    .map((f) => ({
      id: f.id,
      tick: f.tick,
      type: f.type,
      summary: f.publicSummary as string,
      battleFactId: f.battleFactId,
      alchemyFactId: f.alchemyFactId,
    }));

  const battleFacts: PublicView['battleFacts'] = {};
  const alchemyFacts: PublicView['alchemyFacts'] = {};
  for (const pf of publicFacts) {
    if (pf.battleFactId && state.battleFacts[pf.battleFactId]) {
      battleFacts[pf.battleFactId] = state.battleFacts[pf.battleFactId];
    }
    if (pf.alchemyFactId && state.alchemyFacts[pf.alchemyFactId]) {
      alchemyFacts[pf.alchemyFactId] = state.alchemyFacts[pf.alchemyFactId];
    }
  }

  return {
    sectName: state.sectName,
    tick: state.tick,
    day: wt.day,
    shichenLabel: wt.shichenLabel,
    sectReputation: state.sectReputation,
    publicMembers: state.members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      status: m.status,
      portraitId: m.portraitId,
      realm: m.realm,
      realmLayer: m.realmLayer,
      powerScore: computeMemberPowerScore(m),
      background: m.background,
      knownMethods: [...m.knownMethods],
    })),
    publicFacts,
    battleFacts,
    alchemyFacts,
  };
}
