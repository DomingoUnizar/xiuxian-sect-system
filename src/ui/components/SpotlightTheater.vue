<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { DramaScene, Fact, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolvePortraitUrl } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

interface TheaterEpisode {
  id: string;
  badge: string;
  title: string;
  actorName: string;
  portraitId: string | null;
  steps: string[];
  drama?: DramaScene;
  stampText: string | null;
  tone: 'breakthrough' | 'combat' | 'alchemy' | 'craft';
}

const props = defineProps<{
  systemView: SystemView;
  recentFacts: Fact[];
  perspective: 'system' | 'host' | 'public';
  viewHostId: string;
  reducedMotion: boolean;
  guideOpen?: boolean;
}>();

const activeEpisode = ref<TheaterEpisode | null>(null);
const revealedCount = ref(0);
const dismissedFactIds = new Set<string>();
const dismissedDramaIds = new Set<string>();
const lastHandledFactId = ref<string | null>(null);
const lastHandledDramaId = ref<string | null>(props.systemView.dramaLogs?.slice(-1)[0]?.id ?? null);

let stepTimer: number | null = null;
let autoCloseTimer: number | null = null;

function clearTimers() {
  if (stepTimer !== null) {
    window.clearInterval(stepTimer);
    stepTimer = null;
  }
  if (autoCloseTimer !== null) {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

function splitDetailsSteps(details?: string): string[] {
  if (!details) return [];
  return details
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('【去向】') && !line.startsWith('【成算依据】'))
    .slice(0, 4);
}

function buildEpisodeFromFacts(facts: Fact[]): TheaterEpisode | null {
  if (facts.length === 0) return null;

  // 仅在破大境、道统首成、征伐/大比落幕、万剑归宗等大事件演出（常规小事不弹窗）
  const candidates = [...facts].reverse();
  const mainFact = candidates.find((f) => {
    if (dismissedFactIds.has(f.id)) return false;
    if (props.perspective === 'public' && f.visibility !== 'public') return false;
    if (
      props.perspective === 'host' &&
      f.visibility === 'host_private' &&
      f.recipientId !== props.viewHostId
    ) {
      return false;
    }
    if (f.type === 'member.breakthrough' && f.publicSummary?.includes('晋入')) return true;
    if (f.type === 'heritage.achieved') return true;
    if (
      f.type === 'battle.finished' &&
      (f.publicSummary?.includes('【山门大捷】') || f.publicSummary?.includes('大比决赛落幕'))
    ) {
      return true;
    }
    if (f.type === 'cultivation.progressed' && f.systemSummary.includes('万剑归宗')) return true;
    return false;
  });

  if (!mainFact || mainFact.id === lastHandledFactId.value) {
    return null;
  }

  const actorId = mainFact.actorIds[0] ?? mainFact.recipientId;
  const actor = props.systemView.members.find((m) => m.id === actorId);

  let steps: string[] = [];
  let badge = '山门纪实';
  let title = actor ? `${actor.name} · 实况进展` : '山门实况进展';
  let tone: TheaterEpisode['tone'] = 'craft';

  if (mainFact.type === 'member.breakthrough') {
    badge = mainFact.publicSummary?.includes('晋入') ? '破境飞跃' : '冲关受挫';
    title = actor ? `${actor.name} · 破境关键一刻` : '大境冲关';
    tone = 'breakthrough';
    steps = splitDetailsSteps(mainFact.details);
  } else if (mainFact.type === 'battle.finished' && mainFact.battleFactId) {
    const bf = props.systemView.battleFacts[mainFact.battleFactId];
    badge = bf?.mode === 'arena_duel' ? '试剑交锋' : '险境历练';
    title = actor ? `${actor.name} · 斗法实录` : '擂台胜负';
    tone = 'combat';
    if (bf) {
      steps = [
        ...bf.turns.slice(0, 3).map((t) => `第${t.turn}合：${t.detail}`),
        bf.shortReport,
      ];
    }
  } else if (mainFact.type === 'alchemy.finished' && mainFact.alchemyFactId) {
    const af = props.systemView.alchemyFacts[mainFact.alchemyFactId];
    badge = af?.success ? '丹炉启盖' : '丹道试火';
    title = actor ? `${actor.name} · ${af?.recipeName ?? '开炉炼丹'}` : '丹房成丹';
    tone = 'alchemy';
    if (af) {
      steps = splitDetailsSteps(af.detailedReport);
    }
  } else if (mainFact.type === 'forging.finished') {
    const isRefine = mainFact.systemSummary.includes('淬兵强化');
    const isBox = mainFact.systemSummary.includes('天机盲盒');
    badge = isBox ? '天机盲盒' : isRefine ? '器堂淬兵' : mainFact.systemSummary.includes('赐器') ? '天道神兵' : '器堂出炉';
    title = isBox
      ? '仙坊开匣 · 灵光出世'
      : actor
        ? `${actor.name} · ${isRefine ? '百炼淬兵' : mainFact.systemSummary.includes('赐器') ? '神兵认主' : '接纹铸器'}`
        : '新器出炉';
    tone = isBox || isRefine || mainFact.systemSummary.includes('赐器') ? 'breakthrough' : 'craft';
    steps = splitDetailsSteps(mainFact.details);
  } else if (mainFact.type === 'cultivation.progressed') {
    badge = mainFact.systemSummary.includes('万剑归宗') ? '宗门法则' : '大道灌顶';
    title = mainFact.systemSummary.includes('万剑归宗') ? '万剑归宗 · 举宗齐飞' : `${actor?.name ?? '宿主'} · 醍醐灌顶`;
    tone = 'breakthrough';
    steps = splitDetailsSteps(mainFact.details);
    if (steps.length === 0) {
      steps = [props.perspective === 'public' ? (mainFact.publicSummary ?? '') : (mainFact.privateSummary ?? mainFact.publicSummary ?? mainFact.systemSummary)];
    }
  } else if (mainFact.type === 'ability.granted') {
    const isMentor = mainFact.systemSummary.includes('师徒传功');
    badge = isMentor ? '薪火传功' : '洗髓升品';
    title = actor ? `${actor.name} · ${isMentor ? '前辈指点迷津' : '灵根蜕变'}` : '洗髓蜕变';
    tone = 'breakthrough';
  } else if (mainFact.type === 'beast.expedition') {
    badge = '御兽探泉';
    title = actor ? `${actor.name} · 寻露归宗` : '寒泉归宗';
    tone = 'craft';
    steps = splitDetailsSteps(mainFact.details);
  } else if (mainFact.type === 'heritage.achieved') {
    const isEncounter = Boolean(mainFact.details?.includes('【抉择】'));
    badge = isEncounter ? '天机奇遇' : '道统首成';
    title = isEncounter ? `${actor?.name ?? '门人'} · 亲断因果` : '薪火二传 · 宗门立基';
    tone = 'breakthrough';
    steps = isEncounter
      ? splitDetailsSteps(mainFact.details)
      : [mainFact.publicSummary ?? mainFact.systemSummary];
  }

  if (steps.length === 0) {
    const text =
      props.perspective === 'public'
        ? mainFact.publicSummary
        : mainFact.privateSummary ?? mainFact.publicSummary ?? mainFact.systemSummary;
    if (text) steps = [text];
  }
  if (steps.length === 0) return null;

  // 若同行事实中有当前观察者可见的密令赏赐，则作为金色结尾印章融入演武卷
  let stampText: string | null = null;
  if (props.perspective !== 'public') {
    const rewardFact = [...facts].reverse().find(
      (rf) =>
        (rf.type === 'reward.granted' || rf.type === 'hidden_reward.triggered') &&
        rf.cueTier !== 'silent' &&
        (props.perspective === 'system' || rf.recipientId === props.viewHostId),
    );
    if (rewardFact) {
      stampText = rewardFact.privateSummary ?? rewardFact.systemSummary;
    }
  }

  return {
    id: mainFact.id,
    badge,
    title,
    actorName: actor?.name ?? props.systemView.sectName,
    portraitId: actor?.portraitId ?? null,
    steps,
    stampText,
    tone,
  };
}

function closeTheater() {
  if (activeEpisode.value) {
    if (activeEpisode.value.drama) {
      dismissedDramaIds.add(activeEpisode.value.drama.id);
    } else {
      dismissedFactIds.add(activeEpisode.value.id);
    }
  }
  activeEpisode.value = null;
  clearTimers();
}

watch(
  () => props.systemView.dramaLogs,
  (logs) => {
    if (!logs || logs.length === 0 || props.perspective !== 'system') return;
    const latest = logs[logs.length - 1];
    if (!latest || dismissedDramaIds.has(latest.id) || latest.id === lastHandledDramaId.value) return;
    lastHandledDramaId.value = latest.id;
    clearTimers();
    const mappedTone: TheaterEpisode['tone'] =
      latest.tone === 'clutch'
        ? 'breakthrough'
        : latest.tone === 'crisis' || latest.tone === 'rivalry'
          ? 'combat'
          : 'craft';
    activeEpisode.value = {
      id: latest.id,
      badge: latest.badge,
      title: latest.title,
      actorName: latest.actorName,
      portraitId: latest.portraitId,
      steps: latest.beats.slice(0, 3),
      drama: latest,
      stampText: null,
      tone: mappedTone,
    };
    revealedCount.value = latest.beats.length + 1;
    autoCloseTimer = window.setTimeout(() => {
      closeTheater();
    }, 5200);
  },
  { deep: true },
);

watch(
  () => props.recentFacts,
  (facts) => {
    // 若当前已有幕后迪化剧场正在演出，避免普通结算简报覆盖它
    if (activeEpisode.value?.drama) return;
    const episode = buildEpisodeFromFacts(facts);
    if (!episode) return;

    lastHandledFactId.value = episode.id;
    clearTimers();
    const conciseSteps = episode.steps.slice(0, 1);
    activeEpisode.value = { ...episode, steps: conciseSteps };

    const totalLines = conciseSteps.length + (episode.stampText ? 1 : 0);
    revealedCount.value = totalLines;

    autoCloseTimer = window.setTimeout(() => {
      closeTheater();
    }, 3600);
  },
  { deep: true },
);

const showStamp = computed(() => {
  if (!activeEpisode.value?.stampText) return false;
  return revealedCount.value > activeEpisode.value.steps.length;
});

onBeforeUnmount(() => clearTimers());
</script>

<template>
  <div v-if="activeEpisode" class="spotlight-theater-layer" :class="{ 'with-guide-open': guideOpen }" aria-live="polite">
    <article class="spotlight-scroll-card" :class="activeEpisode.tone" data-testid="spotlight-theater">
      <header class="spotlight-head">
        <div class="spotlight-actor">
          <img
            v-if="activeEpisode.portraitId"
            :src="assetUrl(resolvePortraitUrl(activeEpisode.portraitId))"
            :alt="activeEpisode.actorName"
          />
          <div>
            <span class="spotlight-badge">{{ activeEpisode.badge }}</span>
            <h3>{{ activeEpisode.title }}</h3>
          </div>
        </div>
        <button type="button" class="spotlight-close" @click="closeTheater" title="收起演出">
          收起
        </button>
      </header>

      <ol v-if="!activeEpisode.drama && activeEpisode.steps.length > 0" class="spotlight-steps">
        <li
          v-for="(line, idx) in activeEpisode.steps"
          :key="`${activeEpisode.id}-${idx}`"
          v-show="idx < revealedCount"
          class="spotlight-step-line"
        >
          <RichText :text="line" theme="dark" />
        </li>
      </ol>

      <div v-if="activeEpisode.drama && perspective === 'system'" class="drama-contrast-box" data-testid="drama-contrast-box">
        <div class="drama-row truth">
          <span>👁️ 实得</span>
          <p><RichText :text="activeEpisode.drama.systemTruth" theme="dark" /></p>
        </div>
        <div class="drama-row delusion">
          <span>💭 脑补</span>
          <p><RichText :text="activeEpisode.drama.hostDelusion" theme="dark" /></p>
        </div>
        <div class="drama-row shock">
          <span>😲 围观</span>
          <p><RichText :text="activeEpisode.drama.publicShock" theme="dark" /></p>
        </div>
      </div>

      <div v-if="showStamp && activeEpisode.stampText" class="spotlight-stamp">
        <RichText :text="activeEpisode.stampText" theme="dark" />
      </div>
    </article>
  </div>
</template>
