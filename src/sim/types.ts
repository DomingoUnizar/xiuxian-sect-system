import type {
  ArtifactTier,
  ItemQuality,
  PersonalityTrait,
  Realm,
  RuleAbilityId,
  SpiritRootElement,
  SpiritRootGrade,
  SystemPermissionKey,
} from './constants';

export type MemberRole = 'sect_master' | 'elder' | 'disciple';
export type MemberStatus = 'active' | 'injured' | 'departed' | 'dead';
export type SectFocus = 'balanced' | 'alchemy' | 'combat';

export interface AptitudeProfile {
  comprehension: number; // 悟性
  bone: number; // 根骨
  soul: number; // 神魂
  mindset: number; // 心性
  luck: number; // 气运
}

export interface CraftRank {
  alchemy: number; // 0..10 (0 = 未入门, 1..10 品)
  forging: number;
  array: number;
  talisman: number;
}

export interface SpiritRoot {
  elements: SpiritRootElement[];
  grade: SpiritRootGrade;
}

export interface HostEquipment {
  id: string;
  templateId: string;
  name: string;
  tier: ArtifactTier;
  quality: ItemQuality;
  iconPath?: string;
  durability: number;
  maxDurability: number;
  attackBonus: number;
  defenseBonus: number;
  refineLevel?: number;
  specialTrait?: 'water_tide';
}

export interface HostActivity {
  kind:
    | 'idle_cultivate'
    | 'alchemy'
    | 'arena'
    | 'expedition'
    | 'recover'
    | 'study_method'
    | 'forging'
    | 'beast_expedition'
    | 'breakthrough';
  missionId?: string;
  startedTick: number;
  resolveAtTick: number;
  summary: string;
  opponentId?: string;
}

export interface MemberBond {
  targetId: string;
  targetName: string;
  kind: 'rivalry' | 'mentor_ally';
  label: string;
  powerBonus: number;
}

export type SchemeKind = 'nurture' | 'tiger_wolf' | 'dual_rivalry';
export type ClutchChoiceKey = 'future_strike' | 'immortal_aegis' | 'burn_lifespan' | 'watch_coldly';

export type DestinyTraitId =
  | 'trait_moqi'
  | 'trait_sword_bone'
  | 'trait_luck_son'
  | 'trait_reincarnate'
  | 'trait_poison_body'
  | 'trait_involution'
  | 'trait_turtle'
  | 'trait_thunder'
  | 'trait_forge_soul'
  | 'trait_pill_savant'
  | 'trait_battle_mad'
  | 'trait_sweet_talker'
  | 'trait_looter'
  | 'trait_iron_bone';

export type SystemPerkId =
  | 'perk_flying_swords'
  | 'perk_venom_protocol'
  | 'perk_gu_involution'
  | 'perk_daoyuan_rebate'
  | 'perk_thorn_mirror'
  | 'perk_desperate_fury'
  | 'perk_soul_looter'
  | 'perk_epiphany_halo'
  | 'perk_steal_technique'
  | 'perk_mortal_rise';

export type DuelKind = 'chapter_boss' | 'vanguard_outpost';
export type DuelCheatKind = 'whisper_dodge' | 'secret_pill' | 'sword_immortal_strike' | 'burn_lifespan';

export interface ActiveDuelState {
  id: string;
  kind: DuelKind;
  chapterIndex: number;
  title: string;
  actorId: string;
  actorName: string;
  actorPortraitId: string;
  actorTraits: DestinyTraitId[];
  hostHp: number;
  hostMaxHp: number;
  hostShield: number;
  hostAttack: number;
  hostDefense: number;
  opponentName: string;
  opponentTitle: string;
  opponentPortraitId: string;
  oppHp: number;
  oppMaxHp: number;
  oppAttack: number;
  oppDefense: number;
  oppMethod: string;
  oppWeakenedByOutpost: boolean;
  round: number;
  maxRounds: number;
  oppChargingUltimate: boolean;
  dodgeAndCounterReady: boolean;
  immortalStrikeReady: boolean;
  burnedLifespanUsed: boolean;
  strikeUsed: boolean;
  pillsUsed: number;
  whisperCooldown: number;
  status: 'fighting' | 'victory' | 'defeat';
  logs: Array<{ round: number; text: string; tone: 'host' | 'boss' | 'cheat' | 'trait' | 'result' }>;
  resultHeadline?: string;
}

export interface PendingClutchCrisis {
  id: string;
  kind: 'crisis_showdown' | 'tiger_backlash';
  title: string;
  actorId: string;
  actorName: string;
  actorPortraitId: string;
  opponentName?: string;
  opponentTitle?: string;
  opponentPortraitId?: string;
  beats: string[];
  crisisPrompt: string;
  futureCost: number;
  aegisCost: number;
  spawnedAtTick: number;
}

export interface SectCrisisState {
  chapterIndex: number;
  startedAtTick: number;
  deadlineTick: number;
  defeatCount: number;
  revengeBuffUntilTick: number;
  outpostCleared?: boolean;
}

export interface DramaScene {
  id: string;
  tick: number;
  title: string;
  badge: string;
  tone: 'scheme' | 'rivalry' | 'crisis' | 'clutch';
  actorId: string;
  actorName: string;
  portraitId: string;
  beats: string[];
  systemTruth: string;
  hostDelusion: string;
  publicShock: string;
}

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  portraitId: string;
  originRegionId: string;
  background: string;
  ageYears: number;
  lifespanYears: number;
  realm: Realm;
  realmLayer: number; // 炼气一至九层等
  cultivation: number; // 当前修为（缕）
  cultivationCap: number;
  foundation: number; // 个人根基承压值
  caveSupplyPerRound: number;
  meridianCapPerRound: number;
  manualRatePerRound: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  pillToxicity: number;
  spiritRoot: SpiritRoot;
  aptitude: AptitudeProfile;
  personality: PersonalityTrait;
  personalGoal: string;
  auditionLine?: string;
  acceptLine?: string;
  declineLine?: string;
  craftRank: CraftRank;
  knownMethods: string[];
  hasAlchemyFire: boolean;
  hasCompletedFirstAlchemy: boolean;
  hasWonFirstArena: boolean;
  unlockedArenaRematch: boolean;
  equippedWeapon?: HostEquipment;
  pouchPills: Record<string, number>;
  pouchTalismans: number;
  grantedAbilities?: RuleAbilityId[];
  bondedBeastId?: string | null;
  /** 系统秘密绑定信息；仅在正式入门并入宗时建立 */
  binding: {
    bound: boolean;
    bindingId: string | null;
    boundAtTick: number | null;
    /** 每次退宗后仍遵守保密约束，不可泄露或暗示系统存在 */
    secrecyIntact: boolean;
  };
  currentActivity: HostActivity | null;
  injuries: string[];
  notes: string[];
  bonds?: MemberBond[];
  clutchWins?: number;
  destinyTraits?: DestinyTraitId[];
  schemeCooldowns?: Partial<Record<SchemeKind, number>>;
}

export interface CandidateOfferRequirement {
  minSeatTier: 'outer' | 'alchemy_hall' | 'sword_pavilion';
  label: string;
}

export interface Candidate {
  id: string;
  sessionId: string;
  name: string;
  portraitId: string;
  originRegionId: string;
  background: string;
  ageYears: number;
  lifespanYears: number;
  realm: Realm;
  realmLayer: number;
  cultivation: number;
  spiritRoot: SpiritRoot;
  aptitude: AptitudeProfile;
  personality: PersonalityTrait;
  personalGoal: string;
  auditionLine?: string;
  acceptLine?: string;
  declineLine?: string;
  craftRank: CraftRank;
  knownMethods: string[];
  hasAlchemyFire: boolean;
  hasSwordStance: boolean;
  caveSupplyPerRound: number;
  meridianCapPerRound: number;
  manualRatePerRound: number;
  requirement: CandidateOfferRequirement;
  auditioned: boolean;
  outcome: 'pending' | 'accepted' | 'declined';
  decisionReason: string | null;
  joinedMemberId: string | null;
  destinyTraits?: DestinyTraitId[];
}

export interface RecruitmentSession {
  id: string;
  generation: number;
  regionId: string;
  totalSeats: number;
  remainingSeats: number;
  openedAtTick: number;
  candidates: Candidate[];
}

export interface SpiritStones {
  low: number;
  mid: number;
  high: number;
  supreme: number;
}

export interface SectInventory {
  furnaces: number; // 凡炉数量
  furnaceHasWarmCore?: boolean;
  herbs: Record<string, number>; // e.g. herb_ningling, herb_huiqi, herb_humai
  materials?: Record<string, number>; // e.g. mat_chaowen_jade
  pills: Record<string, number>; // e.g. pill_ningling_1_low, pill_humai_2_mid
  talismans: Record<string, number>; // e.g. talisman_escape
  weapons: HostEquipment[];
  spiritStones: SpiritStones;
}

export type MissionTargetType =
  | 'first_alchemy'
  | 'first_arena_win'
  | 'followup_alchemy_humai'
  | 'followup_heritage_fenhuo'
  | 'followup_arena_rematch'
  | 'followup_wild_expedition'
  | 'craft_forging_sword'
  | 'craft_forging_core'
  | 'craft_beast_gather'
  | 'realm_breakthrough'
  | 'challenge_gate_duel'
  | 'conquer_frontline'
  | 'tournament_breakthrough'
  | 'tournament_champion'
  | 'tournament_guard'
  | 'daily_cultivate'
  | 'daily_herb_gather'
  | 'daily_alchemy';

export type RewardKind = 'cultivation_rounds' | 'talisman_escape' | 'method_unlock' | 'pill_grant' | 'rule_ability';

export interface RewardSpec {
  slot: 'primary' | 'hidden';
  kind: RewardKind;
  label: string;
  rounds?: number;
  daoyuanCost: number;
  itemTemplateId?: string;
  itemQty?: number;
  methodId?: string;
  abilityId?: RuleAbilityId;
  hiddenConditionLabel?: string;
}

export type MissionStatus =
  | 'issued'
  | 'accepted'
  | 'declined'
  | 'completed'
  | 'failed'
  | 'expired';

export interface Mission {
  id: string;
  commandId: string;
  targetType: MissionTargetType;
  title: string;
  description: string;
  source: 'player_bounty' | 'auto_daily' | 'standing_bounty';
  standingRuleId?: string;
  recipientId: string;
  issuedAtTick: number;
  deadlineTick: number;
  status: MissionStatus;
  decisionReason: string | null;
  primaryReward: RewardSpec;
  hiddenReward?: RewardSpec;
  primarySettled: boolean;
  hiddenSettled: boolean;
  hiddenReleased: boolean;
  hiddenDeadlineTick?: number | null;
  settledAtTick: number | null;
  tournamentId?: string;
  relatedFactIds: string[];
}

export interface Reservation {
  id: string;
  missionId: string;
  slot: 'primary' | 'hidden';
  kind: 'daoyuan' | 'item';
  amount: number;
  itemTemplateId?: string;
  status: 'reserved' | 'consumed' | 'released';
  createdAtTick: number;
  resolvedAtTick: number | null;
  reason?: string;
}

export interface LedgerEntry {
  id: string; // `${missionId}:${rewardSlot}:${recipientId}` or `heritage:${heritageKey}`
  settlementId: string;
  effectIndex: number;
  tick: number;
  recipientId: string;
  kind:
    | 'cultivation_grant'
    | 'daoyuan_spend'
    | 'daoyuan_gain'
    | 'foundation_gain'
    | 'item_transfer'
    | 'method_grant'
    | 'ability_grant';
  delta: number;
  itemTemplateId?: string;
  methodId?: string;
  abilityId?: RuleAbilityId;
  summary: string;
}

export interface SpiritBeast {
  id: string;
  name: string;
  species: string;
  portraitId: string;
  traits: string[];
  awakened: boolean;
  bondedMemberId: string | null;
}

export interface ForgingFact {
  id: string;
  tick: number;
  actorId: string;
  methodId: string;
  methodName: string;
  materialId: string;
  productKind: 'weapon' | 'furnace_core';
  productId: string;
  productName: string;
  recipientMemberId: string | null;
  shortReport: string;
  detailedReport: string;
}

export interface BeastFact {
  id: string;
  tick: number;
  actorId: string;
  beastId: string;
  beastName: string;
  awakenedUsed: boolean;
  gatheredItems: Array<{ itemId: string; itemName: string; qty: number }>;
  shortReport: string;
  detailedReport: string;
}

export interface SectTournament {
  id: string;
  tickOpened: number;
  prepResolveTick: number;
  duelResolveTick: number;
  phase: 'preparing' | 'dueling' | 'settled';
  breakthroughHostId: string;
  championHostId: string;
  guardianElderId: string;
  breakthroughMissionId: string;
  championMissionId: string;
  guardMissionId: string;
  breakthroughSucceeded?: boolean;
  winnerId?: string;
  bothSafe?: boolean;
  battleFactId?: string;
  summary?: string;
}

export interface ArenaOpponent {
  id: string;
  name: string;
  title: string;
  portraitId?: string;
  realm: Realm;
  realmLayer: number;
  powerScore: number;
  maxHp: number;
  attack: number;
  defense: number;
  evasion: number;
  knownMethod: string;
  available: boolean;
}

export interface BattleTurn {
  turn: number;
  actorName: string;
  action: string;
  detail: string;
  damage: number;
  targetRemainingHp: number;
}

export interface BattleFact {
  id: string;
  tick: number;
  mode: 'arena_duel' | 'wild_expedition';
  actorIds: string[];
  contextAtStart: {
    hostPower: number;
    opponentPower: number;
    hostHp: number;
    opponentHp: number;
    weaponUsed?: string;
    environment: string;
  };
  seedRef: string;
  ruleVersion: string;
  causes: string[];
  turns: BattleTurn[];
  outcome: 'crushing_win' | 'win' | 'close_win' | 'retreat' | 'heavy_defeat' | 'host_died';
  deltas: {
    hostHpDelta: number;
    durabilityDelta: number;
    talismanConsumed: number;
    rescuedBy?: string;
    weaponProtected?: boolean;
    deathCause?: string;
  };
  afterEffectIds: string[];
  shortReport: string;
  detailedReport: string;
}

export interface AlchemyFact {
  id: string;
  tick: number;
  actorId: string;
  recipeId: string;
  recipeName: string;
  usedMethodId: string | null;
  seedRef: string;
  furnaceTempStart: number;
  furnaceTempEnd: number;
  impurityRemoved: number;
  potency: number;
  success: boolean;
  pillTier?: number;
  pillQuality?: ItemQuality;
  pillToxicity?: number;
  destination?: 'sect_vault' | 'host_pouch' | 'consumed_by_peer';
  destinationNote: string;
  failureReason?: string;
  shortReport: string;
  detailedReport: string;
}

export type FactVisibility = 'system_only' | 'host_private' | 'public';

export type FactType =
  | 'world.founded'
  | 'world.phenomenon'
  | 'recruitment.session_opened'
  | 'recruitment.auditioned'
  | 'recruitment.invited'
  | 'recruitment.declined'
  | 'member.joined'
  | 'member.departed'
  | 'member.rejoined'
  | 'member.died'
  | 'member.breakthrough'
  | 'cultivation.progressed'
  | 'alchemy.finished'
  | 'battle.finished'
  | 'mission.issued'
  | 'mission.accepted'
  | 'mission.declined'
  | 'mission.settled'
  | 'mission.expired'
  | 'reward.granted'
  | 'heritage.achieved'
  | 'system.advanced'
  | 'standing_bounty.created'
  | 'herb.gathered'
  | 'forging.finished'
  | 'beast.expedition'
  | 'ability.granted'
  | 'tournament.opened'
  | 'tournament.breakthrough'
  | 'hidden_reward.triggered';

export interface Fact {
  id: string;
  seq: number;
  tick: number;
  type: FactType;
  visibility: FactVisibility;
  recipientId: string | null; // 宿主私令所属者
  actorIds: string[];
  missionId?: string;
  causeIds: string[];
  publicSummary: string | null; // 对宗门公众可见的事实文本（绝不含系统词汇）
  privateSummary: string | null; // 宿主私密文本（含“【叮！...】”）
  systemSummary: string; // 系统全览文本
  details?: string;
  battleFactId?: string;
  alchemyFactId?: string;
  cueTier: 'silent' | 'routine' | 'notable' | 'major';
}

export interface HeritageRecord {
  key: string; // 判重唯一键，如 'heritage:method_fenhuo_tiqing'
  methodId: string;
  methodName: string;
  founderId: string;
  successorId: string;
  achievedAtTick: number;
  foundationAwarded: number;
  daoyuanAwarded: number;
  factId: string;
}

export interface StandingBountyRule {
  id: string;
  title: string;
  triggerCondition: 'new_disciple_first_alchemy' | 'new_disciple_first_arena_win';
  targetType: 'first_alchemy' | 'first_arena_win';
  rewardKind: 'cultivation_rounds' | 'talisman_escape';
  rewardRounds?: number;
  rewardItemQty?: number;
  daoyuanCost: number;
  enabled: boolean;
  createdAtTick: number;
  triggeredMemberIds: string[];
}

export interface CommandReceipt {
  commandId: string;
  tick: number;
  ok: boolean;
  message: string;
  missionId?: string;
  memberId?: string;
  factIds: string[];
}

export type MiracleId =
  | 'empower_peak'
  | 'instant_breakthrough'
  | 'upgrade_root'
  | 'bestow_divine_weapon'
  | 'summon_spirit_tide'
  | 'sect_law_wanjian';

export type SimCommand =
  | {
      commandId: string;
      type: 'recruitment.open_session';
      regionId: string;
    }
  | {
      commandId: string;
      type: 'recruitment.audition';
      candidateId: string;
    }
  | {
      commandId: string;
      type: 'recruitment.invite';
      candidateId: string;
      seatTier: 'outer' | 'alchemy_hall' | 'sword_pavilion';
    }
  | {
      commandId: string;
      type: 'recruitment.auto_fill';
    }
  | {
      commandId: string;
      type: 'member.depart';
      memberId: string;
      reason?: string;
    }
  | {
      commandId: string;
      type: 'member.rejoin';
      memberId: string;
    }
  | {
      commandId: string;
      type: 'member.consume_pill';
      memberId: string;
      pillTemplateId: string;
    }
  | {
      commandId: string;
      type: 'sect.set_focus';
      focus: SectFocus;
    }
  | {
      commandId: string;
      type: 'mission.issue';
      recipientId: string;
      targetType: MissionTargetType;
      rewardKind?: RewardKind;
      rewardRounds?: number;
      deadlineTicks?: number;
      abilityId?: RuleAbilityId;
      rewardItemId?: string;
      rewardMethodId?: string;
      includeHiddenReward?: boolean;
    }
  | {
      commandId: string;
      type: 'member.equip_weapon';
      memberId: string;
      weaponId: string;
    }
  | {
      commandId: string;
      type: 'system.grant_ability';
      recipientId: string;
      abilityId: RuleAbilityId;
    }
  | {
      commandId: string;
      type: 'multi_causal.launch_tournament';
      breakthroughHostId: string;
      championHostId: string;
      guardianElderId: string;
    }
  | {
      commandId: string;
      type: 'standing_bounty.create';
      title: string;
      triggerCondition: 'new_disciple_first_alchemy' | 'new_disciple_first_arena_win';
      rewardKind: 'cultivation_rounds' | 'talisman_escape';
    }
  | {
      commandId: string;
      type: 'standing_bounty.toggle';
      ruleId: string;
      enabled: boolean;
    }
  | {
      commandId: string;
      type: 'system.cast_miracle';
      miracleId: MiracleId;
      targetMemberId?: string;
    }
  | {
      commandId: string;
      type: 'system.toggle_auto_dispatch';
      enabled: boolean;
    }
  | {
      commandId: string;
      type: 'sect.upgrade_spirit_vein';
    }
  | {
      commandId: string;
      type: 'treasury.open_mystery_box';
    }
  | {
      commandId: string;
      type: 'treasury.exchange_stones';
      tier: 'low' | 'mid' | 'high';
    }
  | {
      commandId: string;
      type: 'treasury.restock_herbs';
    }
  | {
      commandId: string;
      type: 'treasury.refine_weapon';
      memberId: string;
    }
  | {
      commandId: string;
      type: 'system.resolve_encounter';
      encounterId: string;
      choice: 'a' | 'b';
    }
  | {
      commandId: string;
      type: 'member.mentor_disciple';
      apprenticeId: string;
    }
  | {
      commandId: string;
      type: 'scheme.execute';
      memberId: string;
      schemeKind: SchemeKind;
    }
  | {
      commandId: string;
      type: 'crisis.resolve_now';
      challengerMemberId?: string;
    }
  | {
      commandId: string;
      type: 'clutch.resolve';
      clutchId: string;
      choice: ClutchChoiceKey;
    }
  | {
      commandId: string;
      type: 'crisis.raid_outpost';
      challengerMemberId?: string;
    }
  | {
      commandId: string;
      type: 'duel.step';
      mode: 'one_round' | 'auto_finish';
    }
  | {
      commandId: string;
      type: 'duel.cheat';
      cheat: DuelCheatKind;
    }
  | {
      commandId: string;
      type: 'duel.close';
    }
  | {
      commandId: string;
      type: 'perk.choose';
      perkId: SystemPerkId;
    };

export interface SectEncounterChoice {
  key: 'a' | 'b';
  label: string;
  hint: string;
  stoneCostLow?: number;
  daoyuanCost?: number;
}

export interface SectEncounter {
  id: string;
  templateId: string;
  title: string;
  tag: string;
  actorId: string;
  actorName: string;
  portraitId: string;
  narrative: string;
  spawnedAtTick: number;
  choices: [SectEncounterChoice, SectEncounterChoice];
}

export type PhenomenonKind =
  | 'spirit_tide'
  | 'earth_fire_surge'
  | 'challenger_at_gate'
  | 'spring_mist_bloom';

export interface MountainPhenomenon {
  id: string;
  kind: PhenomenonKind;
  name: string;
  description: string;
  buffLabel: string;
  startedTick: number;
  expiresAtTick: number;
  challenger?: ArenaOpponent;
}

export interface ClockAnchor {
  lastWallClockMs: number;
  worldTick: number;
  remainderMs: number;
  msPerTick: number;
  lastCatchUpDurationMs: number;
  lastCatchUpTicks: number;
  clockWarning: string | null;
}

export interface WorldState {
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  rngVersion: string;
  seed: number;
  sectName: string;
  sectReputation: number;
  sectFocus: SectFocus;
  tick: number;
  daoyuanAvailable: number;
  daoyuanReserved: number;
  foundationPoints: number;
  unlockedPermissions: SystemPermissionKey[];
  members: Member[];
  recruitment: RecruitmentSession;
  inventory: SectInventory;
  arenaOpponents: ArenaOpponent[];
  missions: Mission[];
  reservations: Reservation[];
  ledger: LedgerEntry[];
  facts: Fact[];
  battleFacts: Record<string, BattleFact>;
  alchemyFacts: Record<string, AlchemyFact>;
  forgingFacts?: Record<string, ForgingFact>;
  beastFacts?: Record<string, BeastFact>;
  spiritBeasts?: SpiritBeast[];
  tournaments?: SectTournament[];
  activePhenomenon?: MountainPhenomenon | null;
  conquestStage?: number;
  autoDispatchEnabled?: boolean;
  sectSpiritVeinLevel?: number;
  pendingEncounter?: SectEncounter | null;
  resolvedEncounterCount?: number;
  heritages: HeritageRecord[];
  standingBounties: StandingBountyRule[];
  sectCrisis?: SectCrisisState;
  pendingClutch?: PendingClutchCrisis | null;
  dramaLogs?: DramaScene[];
  activeDuel?: ActiveDuelState | null;
  systemXp?: number;
  systemLevel?: number;
  activePerks?: SystemPerkId[];
  pendingPerkChoices?: SystemPerkId[] | null;
  receipts: Record<string, CommandReceipt>;
  nextFactSeq: number;
  nextEntitySeq: number;
  rngAttemptCounters: Record<string, number>;
}

export interface SaveEnvelope {
  saveId: string;
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  rngVersion: string;
  revision: number;
  writerEpoch: number;
  clockAnchor: ClockAnchor;
  seed: number;
  snapshot: WorldState;
  checksum: string;
}

export interface SystemView {
  sectName: string;
  seed: number;
  tick: number;
  day: number;
  shichenIndex: number;
  shichenLabel: string;
  sectFocus: SectFocus;
  sectReputation: number;
  daoyuanAvailable: number;
  daoyuanReserved: number;
  foundationPoints: number;
  unlockedPermissions: SystemPermissionKey[];
  members: Member[];
  recruitment: RecruitmentSession;
  inventory: SectInventory;
  arenaOpponents: ArenaOpponent[];
  missions: Mission[];
  reservations: Reservation[];
  ledger: LedgerEntry[];
  facts: Fact[];
  battleFacts: Record<string, BattleFact>;
  alchemyFacts: Record<string, AlchemyFact>;
  forgingFacts: Record<string, ForgingFact>;
  beastFacts: Record<string, BeastFact>;
  spiritBeasts: SpiritBeast[];
  tournaments: SectTournament[];
  activePhenomenon?: MountainPhenomenon | null;
  conquestStage: number;
  autoDispatchEnabled: boolean;
  sectSpiritVeinLevel: number;
  pendingEncounter?: SectEncounter | null;
  resolvedEncounterCount: number;
  heritages: HeritageRecord[];
  standingBounties: StandingBountyRule[];
  sectCrisis: SectCrisisState;
  pendingClutch: PendingClutchCrisis | null;
  dramaLogs: DramaScene[];
  activeDuel: ActiveDuelState | null;
  systemXp: number;
  systemLevel: number;
  activePerks: SystemPerkId[];
  pendingPerkChoices: SystemPerkId[] | null;
}

export interface HostView {
  host: Member;
  /** 仅本人私令 */
  privateMissions: Mission[];
  /** 仅本人个人回执 */
  privateReceipts: LedgerEntry[];
  /** 仅公开事实 + 属于本人的私密事实 */
  visibleFacts: Fact[];
  battleFacts: Record<string, BattleFact>;
  alchemyFacts: Record<string, AlchemyFact>;
}

export interface PublicView {
  sectName: string;
  tick: number;
  day: number;
  shichenLabel: string;
  sectReputation: number;
  /** 仅可公开观察的门人摘要（不含系统绑定字段或私令） */
  publicMembers: Array<{
    id: string;
    name: string;
    role: MemberRole;
    status: MemberStatus;
    portraitId: string;
    realm: Realm;
    realmLayer: number;
    powerScore: number;
    background: string;
    knownMethods: string[];
  }>;
  publicFacts: Array<{
    id: string;
    tick: number;
    type: FactType;
    summary: string;
    battleFactId?: string;
    alchemyFactId?: string;
  }>;
  battleFacts: Record<string, BattleFact>;
  alchemyFacts: Record<string, AlchemyFact>;
}
