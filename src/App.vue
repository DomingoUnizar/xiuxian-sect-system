<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { jadeChime } from './feedback/audio';
import { getCurrentConquestStage } from './sim/conquest';
import type { RuleAbilityId } from './sim/constants';
import { projectHostView, projectPublicView } from './sim/projections';
import { getEffectiveSchemeCost } from './sim/schemes';
import type { ClockAnchor, ClutchChoiceKey, DuelCheatKind, Fact, MissionTargetType, RewardKind, SchemeKind, SectFocus, SimCommand, SystemPerkId, SystemView } from './sim/types';
import { assetUrl } from './ui/assetUrl';
import ChroniclePanel from './ui/components/ChroniclePanel.vue';
import ClutchInterventionModal from './ui/components/ClutchInterventionModal.vue';
import HeritageStandingPanel from './ui/components/HeritageStandingPanel.vue';
import HostDetailPanel from './ui/components/HostDetailPanel.vue';
import LiveDuelModal from './ui/components/LiveDuelModal.vue';
import MissionIssuer from './ui/components/MissionIssuer.vue';
import RecruitmentPanel from './ui/components/RecruitmentPanel.vue';
import ReturnSummaryModal from './ui/components/ReturnSummaryModal.vue';
import RichText from './ui/components/RichText.vue';
import SectCrisisPanel from './ui/components/SectCrisisPanel.vue';
import SectMapStage from './ui/components/SectMapStage.vue';
import SystemDraftModal from './ui/components/SystemDraftModal.vue';
import TopHudBar, { type WatchSpeed } from './ui/components/TopHudBar.vue';
import VaultTreasuryTab from './ui/components/VaultTreasuryTab.vue';
import type { MapZoneId } from './ui/visuals/sectMapSceneData';
import { SimWorkerClient } from './worker/client';
import type { CatchUpReport } from './worker/protocol';

interface ToastItem {
  id: string;
  text: string;
  tone: 'system' | 'combat' | 'alchemy' | 'gold';
}

type DrawerTab = 'hall' | 'recruit' | 'vault' | 'more';

const client = new SimWorkerClient();
const loading = ref(true);
const catchingUp = ref(false);
const errorMsg = ref<string | null>(null);
const systemView = ref<SystemView | null>(null);
const clockAnchor = ref<ClockAnchor | null>(null);
const revision = ref(0);

const selectedMemberId = ref<string>('member_master');
const viewHostId = ref<string>('member_master');
const activeTab = ref<DrawerTab>('hall');
const moreSubTab = ref<'chronicle' | 'heritage'>('chronicle');
const advancedBountyOpen = ref(false);
const showHostDetail = ref(false);
const perspective = ref<'system' | 'host' | 'public'>('system');
const preferredMissionTarget = ref<MissionTargetType | null>(null);
const preferredRewardKind = ref<RewardKind | null>(null);
const preferredRewardItemId = ref<string | null>(null);
const preferredRewardMethodId = ref<string | null>(null);
const hookToken = ref(0);

const showSaveModal = ref(false);
const showDraftModal = ref(false);
const duelBusy = ref(false);
const saveExportJson = ref('');
const saveImportText = ref('');
const newSeedInput = ref('20261123');

const reducedMotion = ref(false);
const muted = ref(false);
const bgmEnabled = ref(false);
const trackLabel = ref(jadeChime.getCurrentTrack().label);
const watchSpeed = ref<WatchSpeed>(1);
const tickProgress = ref(0);

const catchUpReport = ref<CatchUpReport | null>(null);
const toasts = ref<ToastItem[]>([]);
const recentFacts = ref<Fact[]>([]);
let cmdSeq = 1;

const selectedMember = computed(() => {
  if (!systemView.value) return null;
  return (
    systemView.value.members.find((m) => m.id === selectedMemberId.value) ??
    systemView.value.members[0] ??
    null
  );
});

const hostViewData = computed(() => {
  if (!systemView.value) return null;
  return projectHostView(systemView.value, viewHostId.value);
});

const publicViewData = computed(() => {
  if (!systemView.value) return null;
  return projectPublicView(systemView.value);
});

const knownEntityNames = computed(() => {
  const sv = systemView.value;
  if (!sv) return [] as string[];
  const names = new Set<string>();
  for (const m of sv.members) names.add(m.name);
  for (const c of sv.recruitment.candidates) names.add(c.name);
  for (const o of sv.arenaOpponents) names.add(o.name);
  for (const b of sv.spiritBeasts ?? []) names.add(b.name);
  if (sv.activePhenomenon?.challenger) names.add(sv.activePhenomenon.challenger.name);
  if (sv.pendingEncounter?.actorName) names.add(sv.pendingEncounter.actorName);
  names.add(getCurrentConquestStage(sv.conquestStage ?? 0).opponent.name);
  return Array.from(names);
});
provide('richTextNames', knownEntityNames);

const hasInductedNewDisciple = computed(() =>
  Boolean(systemView.value?.recruitment.candidates.some((c) => c.outcome === 'accepted')),
);
const hasIssuedPlayerMission = computed(() =>
  Boolean(systemView.value?.missions.some((m) => m.source === 'player_bounty')),
);
const hasSettledPlayerMission = computed(() =>
  Boolean(systemView.value?.missions.some((m) => m.source === 'player_bounty' && m.status === 'completed')),
);
const hasHallAction = computed(() => {
  const sv = systemView.value;
  if (!sv || activeTab.value === 'hall') return false;
  return (sv.pendingPerkChoices?.length ?? 0) > 0 || Boolean(sv.pendingEncounter);
});
const hasVaultAction = computed(() => {
  const sv = systemView.value;
  if (!sv || activeTab.value === 'vault') return false;
  return sv.inventory.spiritStones.low >= 60;
});
const hasMoreAction = computed(() => {
  const sv = systemView.value;
  if (!sv || activeTab.value === 'more') return false;
  return (
    (sv.foundationPoints >= 2 && sv.standingBounties.length === 0) ||
    (sv.foundationPoints >= 5 && sv.members.every((m) => (m.grantedAbilities?.length ?? 0) === 0))
  );
});

function nextCommandId(prefix: string): string {
  return `${prefix}-${Date.now()}-${cmdSeq++}`;
}

function pushFactCues(newFacts: Fact[], fromAutoLoop = false, hasNewDrama = false) {
  if (newFacts.length > 0) {
    recentFacts.value = [...recentFacts.value.slice(-12), ...newFacts];
  }
  const hasAlchemySuccess = newFacts.some((f) => f.type === 'alchemy.finished');
  const hasBattle = newFacts.some((f) => f.type === 'battle.finished' || f.type === 'member.died');

  const notable = newFacts.filter((f) => f.cueTier === 'major' || f.cueTier === 'notable');
  if (notable.length === 0) {
    if (hasBattle) jadeChime.playSfx('sword');
    else if (hasAlchemySuccess) jadeChime.playSfx('alchemy');
    return;
  }

  // 同一操作若已触发剧场演出，不再重复弹 Toast；自动推演仅在重大事件轻提示
  const toastPool = hasNewDrama
    ? []
    : fromAutoLoop
      ? notable.filter((f) => f.cueTier === 'major')
      : notable;
  if (toastPool.length > 0) {
    const latest = toastPool[toastPool.length - 1];
    const text = latest.privateSummary ?? latest.systemSummary;
    const tone: ToastItem['tone'] =
      latest.type === 'battle.finished'
        ? 'combat'
        : latest.type === 'alchemy.finished' || latest.type === 'forging.finished'
          ? 'alchemy'
          : latest.cueTier === 'major'
            ? 'gold'
            : 'system';
    const id = `${latest.id}-${Date.now()}`;
    toasts.value = [{ id, text, tone }];
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3200);
  }

  const hasFanfare = newFacts.some(
    (f) =>
      (f.type === 'member.breakthrough' && f.publicSummary?.includes('晋入')) ||
      f.type === 'heritage.achieved' ||
      f.systemSummary.includes('气运暴击') ||
      f.systemSummary.includes('征伐大捷') ||
      f.systemSummary.includes('万剑归宗') ||
      f.systemSummary.includes('逆天洗髓') ||
      f.systemSummary.includes('醍醐灌顶') ||
      f.systemSummary.includes('天道赐器') ||
      f.systemSummary.includes('福地升阶') ||
      f.systemSummary.includes('天机盲盒') ||
      f.systemSummary.includes('淬兵强化') ||
      f.systemSummary.includes('师徒传功') ||
      f.systemSummary.includes('灵石熔炼'),
  );
  if (hasFanfare) {
    jadeChime.playFanfare();
  } else if (hasBattle) {
    jadeChime.playSfx('sword');
  } else if (hasAlchemySuccess) {
    jadeChime.playSfx('alchemy');
  } else {
    const hasMajor = notable.some((f) => f.cueTier === 'major');
    jadeChime.playDing(hasMajor ? 'major' : 'notable');
  }
}

async function handleLaunchConquest(memberId: string) {
  selectMember(memberId);
  await handleIssueMission({
    recipientId: memberId,
    targetType: 'conquer_frontline',
    rewardKind: 'cultivation_rounds',
    rewardRounds: 12,
  });
}

async function handleExecuteScheme(schemeKind: SchemeKind, memberIdOverride?: string) {
  const targetId = memberIdOverride ?? selectedMember.value?.id;
  if (!targetId) return;
  await sendCommand({
    commandId: nextCommandId('scheme'),
    type: 'scheme.execute',
    memberId: targetId,
    schemeKind,
  });
}

async function handleResolveCrisis(challengerId?: string) {
  await sendCommand({
    commandId: nextCommandId('crisis'),
    type: 'crisis.resolve_now',
    challengerMemberId: challengerId,
  });
}

async function handleResolveClutch(clutchId: string, choice: ClutchChoiceKey) {
  await sendCommand({
    commandId: nextCommandId('clutch'),
    type: 'clutch.resolve',
    clutchId,
    choice,
  });
}

async function handleRaidOutpost(challengerId?: string) {
  await sendCommand({
    commandId: nextCommandId('outpost'),
    type: 'crisis.raid_outpost',
    challengerMemberId: challengerId,
  });
}

async function handleDuelStep(mode: 'one_round' | 'auto_finish') {
  if (duelBusy.value && mode === 'one_round') return;
  duelBusy.value = true;
  try {
    await sendCommand({
      commandId: nextCommandId('duelstep'),
      type: 'duel.step',
      mode,
    });
  } finally {
    duelBusy.value = false;
  }
}

async function handleDuelCheat(cheat: DuelCheatKind) {
  if (duelBusy.value) return;
  duelBusy.value = true;
  try {
    await sendCommand({
      commandId: nextCommandId('duelcheat'),
      type: 'duel.cheat',
      cheat,
    });
  } finally {
    duelBusy.value = false;
  }
}

async function handleDuelClose() {
  duelBusy.value = true;
  try {
    await sendCommand({
      commandId: nextCommandId('duelclose'),
      type: 'duel.close',
    });
  } finally {
    duelBusy.value = false;
  }
}

async function handleChoosePerk(perkId: SystemPerkId) {
  await sendCommand({
    commandId: nextCommandId('perk'),
    type: 'perk.choose',
    perkId,
  });
  showDraftModal.value = false;
}

async function handleToggleAutoDispatch() {
  if (!systemView.value) return;
  await sendCommand({
    commandId: nextCommandId('autodisp'),
    type: 'system.toggle_auto_dispatch',
    enabled: !systemView.value.autoDispatchEnabled,
  });
}

function toggleMute() {
  muted.value = !muted.value;
  jadeChime.setSfxMuted(muted.value);
}

function toggleBgm() {
  bgmEnabled.value = jadeChime.toggleBgm();
  trackLabel.value = jadeChime.getCurrentTrack().label;
}

function nextBgmTrack() {
  const next = jadeChime.nextTrack();
  trackLabel.value = next.label;
}

function setSpeed(speed: WatchSpeed) {
  watchSpeed.value = speed;
  tickProgress.value = 0;
}

function selectMember(id: string) {
  selectedMemberId.value = id;
  viewHostId.value = id;
}

function handleZoneAction(zoneId: MapZoneId) {
  if (zoneId === 'gate') {
    activeTab.value = 'recruit';
    return;
  }
  if (zoneId === 'heritage') {
    activeTab.value = 'more';
    moreSubTab.value = 'heritage';
    return;
  }
  if (zoneId === 'spring') {
    activeTab.value = 'vault';
    return;
  }
  activeTab.value = 'hall';
  if (zoneId === 'alchemy') {
    advancedBountyOpen.value = true;
    preferredMissionTarget.value = selectedMember.value?.hasCompletedFirstAlchemy
      ? 'followup_alchemy_humai'
      : 'first_alchemy';
    preferredRewardKind.value = 'cultivation_rounds';
    hookToken.value += 1;
  } else if (zoneId === 'arena') {
    advancedBountyOpen.value = true;
    preferredMissionTarget.value =
      systemView.value?.activePhenomenon?.kind === 'challenger_at_gate'
        ? 'challenge_gate_duel'
        : selectedMember.value?.hasWonFirstArena
          ? 'followup_arena_rematch'
          : 'first_arena_win';
    preferredRewardKind.value = 'cultivation_rounds';
    hookToken.value += 1;
  } else if (zoneId === 'pass') {
    advancedBountyOpen.value = true;
    preferredMissionTarget.value = 'followup_wild_expedition';
    preferredRewardKind.value = 'cultivation_rounds';
    hookToken.value += 1;
  }
}

async function sendCommand(command: SimCommand) {
  jadeChime.unlock();
  errorMsg.value = null;
  const prevDramaLen = systemView.value?.dramaLogs?.length ?? 0;
  try {
    const res = await client.submitCommand(command);
    systemView.value = res.systemView;
    clockAnchor.value = res.clockAnchor;
    revision.value = res.revision;
    if (command.type === 'recruitment.invite') {
      const joined = res.systemView.recruitment.candidates.find((c) => c.id === command.candidateId);
      if (joined?.joinedMemberId) {
        selectMember(joined.joinedMemberId);
        activeTab.value = 'hall';
      }
    }
    const hasNewDrama = (res.systemView.dramaLogs?.length ?? 0) > prevDramaLen;
    pushFactCues(res.newFacts, false, hasNewDrama);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  }
}

async function handleIssueMission(payload: {
  recipientId: string;
  targetType: MissionTargetType;
  rewardKind: RewardKind;
  rewardRounds: number;
  abilityId?: RuleAbilityId;
  rewardItemId?: string;
  rewardMethodId?: string;
  includeHiddenReward?: boolean;
}) {
  await sendCommand({
    commandId: nextCommandId('mission'),
    type: 'mission.issue',
    recipientId: payload.recipientId,
    targetType: payload.targetType,
    rewardKind: payload.rewardKind,
    rewardRounds: payload.rewardRounds,
    abilityId: payload.abilityId,
    rewardItemId: payload.rewardItemId,
    rewardMethodId: payload.rewardMethodId,
    includeHiddenReward: payload.includeHiddenReward,
  });
}

async function bootstrap() {
  loading.value = true;
  errorMsg.value = null;
  let pendingCatchUp = 0;
  try {
    const res = await client.init();
    systemView.value = res.systemView;
    clockAnchor.value = res.clockAnchor;
    revision.value = res.revision;
    const newestDisciple = [...res.systemView.members].reverse().find((m) => m.status === 'active');
    if (newestDisciple) {
      selectMember(newestDisciple.id);
    }
    if (res.catchUpReport && res.catchUpReport.ticksSimulated > 0) {
      catchUpReport.value = res.catchUpReport;
    }
    pendingCatchUp = res.pendingCatchUpTicks ?? 0;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }

  if (pendingCatchUp > 0) {
    catchingUp.value = true;
    try {
      const catchRes = await client.catchUpWallClock();
      systemView.value = catchRes.systemView;
      clockAnchor.value = catchRes.clockAnchor;
      revision.value = catchRes.revision;
      if (catchRes.catchUpReport && catchRes.catchUpReport.ticksSimulated > 0) {
        catchUpReport.value = catchRes.catchUpReport;
      }
      pushFactCues(catchRes.newFacts, true);
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : String(err);
    } finally {
      catchingUp.value = false;
    }
  }
}

async function stepTicks(deltaTicks: number, fromAutoLoop = false) {
  jadeChime.unlock();
  if (!systemView.value) return;
  const prevDramaLen = systemView.value.dramaLogs?.length ?? 0;
  try {
    const res = await client.advanceTo(systemView.value.tick + deltaTicks);
    systemView.value = res.systemView;
    clockAnchor.value = res.clockAnchor;
    revision.value = res.revision;
    const hasNewDrama = (res.systemView.dramaLogs?.length ?? 0) > prevDramaLen;
    pushFactCues(res.newFacts, fromAutoLoop, hasNewDrama);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  }
}

function focusDiscipleFromReturn(memberId: string) {
  selectMember(memberId);
  activeTab.value = 'hall';
  catchUpReport.value = null;
}

async function openSaveModal() {
  const res = await client.exportSave();
  saveExportJson.value = res.exportJson ?? '';
  showSaveModal.value = true;
}

async function handleResetSeed() {
  const parsed = Number.parseInt(newSeedInput.value.trim(), 10);
  const seed = Number.isFinite(parsed) && parsed > 0 ? parsed : 20261123;
  const res = await client.resetWorld(seed);
  systemView.value = res.systemView;
  clockAnchor.value = res.clockAnchor;
  revision.value = res.revision;
  selectMember('member_master');
  catchUpReport.value = null;
  toasts.value = [];
  recentFacts.value = [];
  showSaveModal.value = false;
}

async function handleImportSave() {
  if (!saveImportText.value.trim()) return;
  const res = await client.importSave(saveImportText.value);
  systemView.value = res.systemView;
  clockAnchor.value = res.clockAnchor;
  revision.value = res.revision;
  showSaveModal.value = false;
}

function handleVisibilityChange() {
  jadeChime.handleVisibility(document.visibilityState === 'hidden');
  if (systemView.value?.activeDuel?.status === 'fighting' || systemView.value?.pendingClutch) {
    return;
  }
  if (document.visibilityState === 'visible') {
    void client.catchUpWallClock().then((res) => {
      systemView.value = res.systemView;
      clockAnchor.value = res.clockAnchor;
      revision.value = res.revision;
      if (res.catchUpReport && res.catchUpReport.ticksSimulated >= 2) {
        catchUpReport.value = res.catchUpReport;
      }
      pushFactCues(res.newFacts);
    });
  } else {
    void client.catchUpWallClock();
  }
}

let loopTimer: number | null = null;
let accumMs = 0;
const STEP_INTERVAL_MS = 250;

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Escape') {
    showSaveModal.value = false;
    showDraftModal.value = false;
    return;
  }
  if (
    showSaveModal.value ||
    showDraftModal.value ||
    catchUpReport.value ||
    systemView.value?.pendingClutch ||
    systemView.value?.activeDuel?.status === 'fighting'
  ) {
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(watchSpeed.value === 0 ? 1 : 0);
  } else if (e.key === '1') {
    setSpeed(1);
  } else if (e.key === '2') {
    setSpeed(2);
  } else if (e.key === '3') {
    setSpeed(5);
  } else if (e.key === 'f' || e.key === 'F') {
    void stepTicks(3);
  }
}

onMounted(() => {
  void bootstrap();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('keydown', handleKeydown);
  loopTimer = window.setInterval(() => {
    if (
      watchSpeed.value === 0 ||
      !systemView.value ||
      showSaveModal.value ||
      showDraftModal.value ||
      systemView.value.pendingClutch ||
      systemView.value.activeDuel?.status === 'fighting'
    ) {
      return;
    }
    const periodMs = watchSpeed.value === 5 ? 500 : watchSpeed.value === 2 ? 1200 : 2500;
    accumMs += STEP_INTERVAL_MS;
    tickProgress.value = Math.min(1, accumMs / periodMs);
    if (accumMs >= periodMs) {
      accumMs = 0;
      tickProgress.value = 0;
      void stepTicks(1, true);
    }
  }, STEP_INTERVAL_MS);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('keydown', handleKeydown);
  if (loopTimer !== null) {
    window.clearInterval(loopTimer);
  }
  client.dispose();
});
</script>

<template>
  <div
    class="game-viewport"
    :class="{ 'reduced-motion': reducedMotion }"
    :style="{ cursor: `url(${assetUrl('assets/ui/celestial_jade_cursor.png')}) 4 4, auto` }"
  >
    <TopHudBar
      :system-view="systemView"
      :revision="revision"
      :watch-speed="watchSpeed"
      :tick-progress="tickProgress"
      :bgm-enabled="bgmEnabled"
      :track-label="trackLabel"
      :muted="muted"
      :reduced-motion="reducedMotion"
      @set-focus="(focus) => sendCommand({ commandId: nextCommandId('focus'), type: 'sect.set_focus', focus })"
      @set-speed="setSpeed"
      @step-ticks="stepTicks"
      @toggle-auto-dispatch="handleToggleAutoDispatch"
      @toggle-bgm="toggleBgm"
      @next-bgm="nextBgmTrack"
      @toggle-mute="toggleMute"
      @toggle-motion="reducedMotion = !reducedMotion"
      @open-save="openSaveModal"
    />

    <main v-if="systemView" class="workspace-split">
      <!-- 左侧：正常山地可交互宗门大地图 -->
      <SectMapStage
        :system-view="systemView"
        :selected-member-id="selectedMemberId"
        :perspective="perspective"
        :view-host-id="viewHostId"
        :reduced-motion="reducedMotion"
        :recent-facts="recentFacts"
        :has-inducted-new-disciple="hasInductedNewDisciple"
        :has-issued-player-mission="hasIssuedPlayerMission"
        :has-settled-player-mission="hasSettledPlayerMission"
        @select-member="selectMember"
        @zone-action="handleZoneAction"
        @open-candidate="() => { activeTab = 'recruit'; }"
        @open-chronicle="() => { activeTab = 'more'; moreSubTab = 'chronicle'; }"
        @raid-outpost="handleRaidOutpost"
        @open-perk-draft="showDraftModal = true"
      />

      <!-- 右侧：极简清爽功能侧栏（4页签） -->
      <aside class="right-drawer" aria-label="系统操作侧栏">
        <nav class="drawer-tabs" aria-label="功能分区导航">
          <button
            type="button"
            class="drawer-tab-btn"
            :class="{ active: activeTab === 'hall' }"
            data-testid="tab-hall"
            @click="activeTab = 'hall'"
          >
            <span v-if="hasHallAction" class="tab-notify-dot" aria-hidden="true" />
            <img :src="assetUrl('assets/ui/shared_bagua_symbol.webp')" alt="" aria-hidden="true" />
            <span>修炼</span>
          </button>
          <button
            type="button"
            class="drawer-tab-btn"
            :class="{ active: activeTab === 'recruit' }"
            data-testid="tab-recruit"
            @click="activeTab = 'recruit'"
          >
            <img :src="assetUrl('assets/ui/celestial_jade_symbol.webp')" alt="" aria-hidden="true" />
            <span>招徒({{ systemView.recruitment.remainingSeats }})</span>
          </button>
          <button
            type="button"
            class="drawer-tab-btn"
            :class="{ active: activeTab === 'vault' }"
            data-testid="tab-vault"
            @click="activeTab = 'vault'"
          >
            <span v-if="hasVaultAction" class="tab-notify-dot soft" aria-hidden="true" />
            <img :src="assetUrl('assets/icons/pills-01.png')" alt="" aria-hidden="true" />
            <span>宝库</span>
          </button>
          <button
            type="button"
            class="drawer-tab-btn"
            :class="{ active: activeTab === 'more' }"
            data-testid="tab-more"
            @click="activeTab = 'more'"
          >
            <span v-if="hasMoreAction" class="tab-notify-dot soft" aria-hidden="true" />
            <img :src="assetUrl('assets/icons/manuals-01.png')" alt="" aria-hidden="true" />
            <span>纪事·道统</span>
          </button>
        </nav>

        <div class="drawer-scroll-body">
          <!-- Tab 1: 极简核心循环（2张主卡 + 可选折叠档案） -->
          <div v-if="activeTab === 'hall'" class="drawer-stack">
            <SectCrisisPanel
              :system-view="systemView"
              @resolve-crisis="handleResolveCrisis"
              @raid-outpost="handleRaidOutpost"
              @open-perk-draft="showDraftModal = true"
              @resolve-encounter="(encId, ch) => sendCommand({ commandId: nextCommandId('enc'), type: 'system.resolve_encounter', encounterId: encId, choice: ch })"
            />

            <MissionIssuer
              v-if="selectedMember"
              :system-view="systemView"
              :members="systemView.members"
              :selected-member-id="selectedMemberId"
              :selected-member="selectedMember"
              :advanced-open="advancedBountyOpen"
              :preferred-target="preferredMissionTarget"
              :preferred-reward-kind="preferredRewardKind"
              :preferred-reward-item-id="preferredRewardItemId"
              :preferred-reward-method-id="preferredRewardMethodId"
              :hook-token="hookToken"
              @select-member="selectMember"
              @update:advanced-open="(v) => (advancedBountyOpen = v)"
              @execute-scheme="handleExecuteScheme"
              @issue-mission="handleIssueMission"
              @fast-resolve="stepTicks"
            />

            <template v-if="selectedMember">
              <button
                type="button"
                class="drawer-accordion-btn"
                data-testid="toggle-host-detail"
                @click="showHostDetail = !showHostDetail"
              >
                <span>📋 查看「{{ selectedMember.name }}」完整档案、丹药与装备</span>
                <span>{{ showHostDetail ? '收起 ▴' : '展开 ▾' }}</span>
              </button>

              <HostDetailPanel
                v-if="showHostDetail"
                :member="selectedMember"
                :missions="systemView.missions.filter((m) => m.recipientId === selectedMember!.id)"
                :ledger-entries="systemView.ledger.filter((l) => l.recipientId === selectedMember!.id)"
                :available-pills="systemView.inventory.pills"
                :vault-weapons="systemView.inventory.weapons"
                :show-secrets="true"
                @depart="(id) => sendCommand({ commandId: nextCommandId('depart'), type: 'member.depart', memberId: id })"
                @rejoin="(id) => sendCommand({ commandId: nextCommandId('rejoin'), type: 'member.rejoin', memberId: id })"
                @consume-pill="(mid, pid) => sendCommand({ commandId: nextCommandId('pill'), type: 'member.consume_pill', memberId: mid, pillTemplateId: pid })"
                @equip-weapon="(mid, wid) => sendCommand({ commandId: nextCommandId('equip'), type: 'member.equip_weapon', memberId: mid, weaponId: wid })"
                @refine-weapon="(mid) => sendCommand({ commandId: nextCommandId('refine'), type: 'treasury.refine_weapon', memberId: mid })"
                @mentor-disciple="(mid) => sendCommand({ commandId: nextCommandId('mentor'), type: 'member.mentor_disciple', apprenticeId: mid })"
              />
            </template>
          </div>

          <!-- Tab 2: 开山招徒 -->
          <RecruitmentPanel
            v-else-if="activeTab === 'recruit'"
            :recruitment="systemView.recruitment"
            :sect-focus="systemView.sectFocus"
            @open-session="(regionId) => sendCommand({ commandId: nextCommandId('open'), type: 'recruitment.open_session', regionId })"
            @audition="(candidateId) => sendCommand({ commandId: nextCommandId('aud'), type: 'recruitment.audition', candidateId })"
            @invite="(candidateId, seatTier) => sendCommand({ commandId: nextCommandId('inv'), type: 'recruitment.invite', candidateId, seatTier })"
            @auto-fill="sendCommand({ commandId: nextCommandId('fill'), type: 'recruitment.auto_fill' })"
          />

          <!-- Tab 3: 丹库与百宝阁 -->
          <VaultTreasuryTab
            v-else-if="activeTab === 'vault'"
            :system-view="systemView"
            @upgrade-vein="sendCommand({ commandId: nextCommandId('vein'), type: 'sect.upgrade_spirit_vein' })"
            @open-mystery-box="sendCommand({ commandId: nextCommandId('box'), type: 'treasury.open_mystery_box' })"
            @exchange-stones="(tier) => sendCommand({ commandId: nextCommandId('exch'), type: 'treasury.exchange_stones', tier })"
            @restock-herbs="sendCommand({ commandId: nextCommandId('herb'), type: 'treasury.restock_herbs' })"
            @refine-weapon="(mid) => sendCommand({ commandId: nextCommandId('refine'), type: 'treasury.refine_weapon', memberId: mid })"
            @launch-conquest="handleLaunchConquest"
          />

          <!-- Tab 4: 纪事与道统切换区 -->
          <div v-else class="drawer-stack">
            <div class="more-subtabs">
              <button
                type="button"
                class="target-chip"
                :class="{ active: moreSubTab === 'chronicle' }"
                data-testid="tab-chronicle"
                @click="moreSubTab = 'chronicle'"
              >
                📜 迪化纪事与视角
              </button>
              <button
                type="button"
                class="target-chip"
                :class="{ active: moreSubTab === 'heritage' }"
                data-testid="tab-heritage"
                @click="moreSubTab = 'heritage'"
              >
                🏛️ 道统传承与大比
              </button>
            </div>

            <HeritageStandingPanel
              v-if="moreSubTab === 'heritage'"
              :system-view="systemView"
              @create-standing="(p) => sendCommand({ commandId: nextCommandId('standing'), type: 'standing_bounty.create', title: p.title, triggerCondition: p.triggerCondition, rewardKind: p.rewardKind })"
              @toggle-standing="(ruleId, enabled) => sendCommand({ commandId: nextCommandId('toggle'), type: 'standing_bounty.toggle', ruleId, enabled })"
              @grant-ability="(p) => sendCommand({ commandId: nextCommandId('grant'), type: 'system.grant_ability', recipientId: p.recipientId, abilityId: p.abilityId })"
              @launch-tournament="(p) => sendCommand({ commandId: nextCommandId('tourn'), type: 'multi_causal.launch_tournament', breakthroughHostId: p.breakthroughHostId, championHostId: p.championHostId, guardianElderId: p.guardianElderId })"
              @cast-wanjian="sendCommand({ commandId: nextCommandId('miracle'), type: 'system.cast_miracle', miracleId: 'sect_law_wanjian' })"
            />

            <template v-else>
            <section class="parchment-card perspective-bar" data-testid="perspective-switcher">
              <div class="card-header" style="margin-bottom: 6px">
                <h2 class="card-title">幕后洞鉴 · 迪化实录与三界视角</h2>
                <span class="paper-pill">同步过滤地图气泡</span>
              </div>
              <div class="target-chip-grid">
                <button
                  type="button"
                  class="target-chip"
                  :class="{ active: perspective === 'system' }"
                  data-testid="view-system"
                  @click="perspective = 'system'"
                >
                  系统全览
                </button>
                <button
                  type="button"
                  class="target-chip"
                  :class="{ active: perspective === 'host' }"
                  data-testid="view-host"
                  @click="perspective = 'host'"
                >
                  单宿主私令
                </button>
                <button
                  type="button"
                  class="target-chip"
                  :class="{ active: perspective === 'public' }"
                  data-testid="view-public"
                  @click="perspective = 'public'"
                >
                  宗门公开纪事
                </button>
              </div>
              <select
                v-if="perspective === 'host'"
                v-model="viewHostId"
                class="paper-select"
                style="margin-top: 8px; width: 100%"
                data-testid="select-host-perspective"
                aria-label="选择检视哪位宿主"
              >
                <option v-for="m in systemView.members" :key="m.id" :value="m.id">
                  仅看「{{ m.name }}」所见私密视角
                </option>
              </select>
            </section>

            <HostDetailPanel
              v-if="perspective === 'host' && hostViewData"
              :member="hostViewData.host"
              :missions="hostViewData.privateMissions"
              :ledger-entries="hostViewData.privateReceipts"
              :available-pills="systemView.inventory.pills"
              :show-secrets="true"
              @depart="(id) => sendCommand({ commandId: nextCommandId('depart'), type: 'member.depart', memberId: id })"
              @rejoin="(id) => sendCommand({ commandId: nextCommandId('rejoin'), type: 'member.rejoin', memberId: id })"
              @consume-pill="(mid, pid) => sendCommand({ commandId: nextCommandId('pill'), type: 'member.consume_pill', memberId: mid, pillTemplateId: pid })"
            />

            <section v-if="perspective === 'system' && systemView.dramaLogs.length > 0" class="parchment-card drama-archive-card">
              <header class="card-header" style="margin-bottom: 6px">
                <h3 class="card-title">🎭 迪化名场面实录（最近 {{ systemView.dramaLogs.length }} 场）</h3>
              </header>
              <div class="drawer-stack">
                <article
                  v-for="dr in [...systemView.dramaLogs].reverse().slice(0, 5)"
                  :key="dr.id"
                  class="drama-archive-item"
                >
                  <div class="drama-archive-head">
                    <span class="paper-pill gold">{{ dr.badge }}</span>
                    <strong>{{ dr.title }}</strong>
                  </div>
                  <div class="drama-row-light"><b>👁️ 幕后：</b><RichText :text="dr.systemTruth" /></div>
                  <div class="drama-row-light"><b>💭 迪化：</b><RichText :text="dr.hostDelusion" /></div>
                  <div class="drama-row-light"><b>😲 外界：</b><RichText :text="dr.publicShock" /></div>
                </article>
              </div>
            </section>

            <ChroniclePanel
              v-if="perspective === 'system'"
              mode="system"
              :facts="systemView.facts"
              :battle-facts="systemView.battleFacts"
              :alchemy-facts="systemView.alchemyFacts"
            />
            <ChroniclePanel
              v-else-if="perspective === 'host' && hostViewData"
              mode="host"
              :facts="hostViewData.visibleFacts"
              :battle-facts="hostViewData.battleFacts"
              :alchemy-facts="hostViewData.alchemyFacts"
            />
            <ChroniclePanel
              v-else-if="perspective === 'public' && publicViewData"
              mode="public"
              :facts="[]"
              :public-facts="publicViewData.publicFacts"
              :battle-facts="publicViewData.battleFacts"
              :alchemy-facts="publicViewData.alchemyFacts"
            />
            </template>
          </div>
        </div>
      </aside>
    </main>

    <div v-if="loading" class="loading-state">
      正在从本地道统库读取山门档案
    </div>
    <div v-if="catchingUp" class="catchup-pill" aria-live="polite">
      ⚡ 正在推演离山历程…
    </div>
    <div v-if="errorMsg" class="error-banner" role="alert">
      <span>运行提示：{{ errorMsg }}</span>
      <button type="button" class="toast-ack-btn" @click="errorMsg = null">关闭</button>
    </div>

    <ReturnSummaryModal
      v-if="catchUpReport && systemView"
      :report="catchUpReport"
      :system-view="systemView"
      @close="catchUpReport = null"
      @focus-member="focusDiscipleFromReturn"
    />

    <ClutchInterventionModal
      v-if="systemView && systemView.pendingClutch"
      :clutch="systemView.pendingClutch"
      :daoyuan-available="systemView.daoyuanAvailable"
      @resolve="handleResolveClutch"
    />

    <LiveDuelModal
      v-if="systemView && systemView.activeDuel"
      :duel="systemView.activeDuel"
      :daoyuan-available="systemView.daoyuanAvailable"
      :pill-count="Object.values(systemView.inventory.pills).reduce((a, b) => a + b, 0)"
      :active-perks="systemView.activePerks"
      :busy="duelBusy"
      @step="handleDuelStep"
      @cheat="handleDuelCheat"
      @close="handleDuelClose"
    />

    <SystemDraftModal
      v-if="showDraftModal && systemView && systemView.pendingPerkChoices && systemView.pendingPerkChoices.length > 0"
      :choices="systemView.pendingPerkChoices"
      :system-level="systemView.systemLevel"
      @choose="handleChoosePerk"
      @close="showDraftModal = false"
    />

    <div class="ding-stack" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="ding-toast"
        :class="toast.tone"
        data-testid="ding-toast"
      >
        <RichText :text="toast.text" theme="dark" />
        <button
          type="button"
          class="toast-ack-btn"
          @click="toasts = toasts.filter((t) => t.id !== toast.id)"
        >
          知晓
        </button>
      </div>
    </div>

    <!-- 设置与存档弹窗 -->
    <div
      v-if="showSaveModal"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="设置与存档管理"
      @click.self="showSaveModal = false"
    >
      <div class="parchment-modal save-modal">
        <div class="modal-body-pad">
          <header class="card-header">
            <h2 class="card-title">设置、雅乐与存档管理</h2>
            <button type="button" class="paper-btn subtle" @click="showSaveModal = false">关闭</button>
          </header>

          <div class="settings-pref-box">
            <div class="settings-pref-row">
              <button
                type="button"
                class="paper-btn"
                :class="{ active: bgmEnabled }"
                data-testid="btn-bgm"
                @click="toggleBgm"
              >
                {{ bgmEnabled ? `雅乐：奏鸣·${trackLabel}` : '山门雅乐' }}
              </button>
              <button
                type="button"
                class="paper-btn"
                data-testid="btn-bgm-next"
                @click="nextBgmTrack"
              >
                换曲
              </button>
              <button
                type="button"
                class="paper-btn"
                :class="{ active: muted }"
                data-testid="btn-mute"
                @click="toggleMute"
              >
                {{ muted ? '🔇 已静音' : '🔊 音效开' }}
              </button>
              <button
                type="button"
                class="paper-btn"
                :class="{ active: reducedMotion }"
                data-testid="btn-reduced-motion"
                @click="reducedMotion = !reducedMotion"
              >
                {{ reducedMotion ? '静画模式' : '✨ 动效开' }}
              </button>
            </div>

            <div class="settings-pref-row" v-if="systemView" style="justify-content: space-between">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem">
                <span>宗门培养倾向：</span>
                <select
                  class="paper-select"
                  :value="systemView.sectFocus"
                  @change="sendCommand({ commandId: nextCommandId('focus'), type: 'sect.set_focus', focus: ($event.target as HTMLSelectElement).value as SectFocus })"
                >
                  <option value="balanced">均衡养徒</option>
                  <option value="alchemy">重丹堂</option>
                  <option value="combat">重试剑</option>
                </select>
              </label>
              <span class="field-caption" data-testid="world-seed-info">
                种子 {{ systemView.seed }} · 修订 #{{ revision }}
              </span>
            </div>

            <div class="settings-shortcut-tip">
              快捷键：空格 暂停/继续 · 1/2/3 切流速 · F 快进 3 刻 · Esc 关窗
            </div>
          </div>

          <div class="drawer-stack" style="margin-top: 10px">
            <label class="record-row">
              <span class="field-caption">输入世界种子重开一局：</span>
              <div style="display: flex; gap: 8px; margin-top: 6px">
                <input v-model="newSeedInput" class="paper-select" style="flex: 1" />
                <button
                  type="button"
                  class="cta-nephrite-btn"
                  :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
                  data-testid="btn-reset-seed"
                  @click="handleResetSeed"
                >
                  新开山门
                </button>
              </div>
            </label>
            <label class="record-row">
              <span class="field-caption">当前完整存档 JSON（含 SHA-256 校验和）：</span>
              <textarea
                readonly
                :value="saveExportJson"
                rows="6"
                class="paper-select mono"
                style="width: 100%; font-size: 0.78rem; margin-top: 6px"
              />
            </label>
            <label class="record-row">
              <span class="field-caption">导入存档 JSON 覆盖当前槽位：</span>
              <textarea
                v-model="saveImportText"
                rows="4"
                placeholder="在此粘贴备份的存档 JSON"
                class="paper-select mono"
                style="width: 100%; font-size: 0.78rem; margin-top: 6px"
              />
            </label>
            <div class="modal-footer">
              <button
                type="button"
                class="cta-jade-btn"
                :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_button.webp')})` }"
                @click="handleImportSave"
              >
                导入存档
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
