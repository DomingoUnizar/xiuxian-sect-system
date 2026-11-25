<script setup lang="ts">
import { computed } from 'vue';
import { getChampionEffectivePower, getCurrentCrisisSpec } from '../../sim/crisis';
import { getSystemXpThreshold, SYSTEM_PERKS } from '../../sim/destinyTraits';
import type { SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolveOpponentAvatar, resolvePortraitUrl } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = defineProps<{
  systemView: SystemView;
}>();

const emit = defineEmits<{
  resolveCrisis: [challengerId?: string];
  raidOutpost: [challengerId?: string];
  openPerkDraft: [];
  resolveEncounter: [encounterId: string, choice: 'a' | 'b'];
}>();

const crisis = computed(() => props.systemView.sectCrisis);
const spec = computed(() => getCurrentCrisisSpec(crisis.value.chapterIndex));

const daysLeft = computed(() =>
  Math.max(0, Math.ceil((crisis.value.deadlineTick - props.systemView.tick) / 12)),
);

const champion = computed(() => {
  const actives = props.systemView.members.filter((m) => m.status === 'active' && m.binding.bound);
  if (actives.length === 0) return null;
  return [...actives].sort(
    (a, b) => getChampionEffectivePower(b).totalPower - getChampionEffectivePower(a).totalPower,
  )[0];
});

const championPower = computed(() =>
  champion.value ? getChampionEffectivePower(champion.value) : { basePower: 0, tacticalBonus: 0, totalPower: 0 },
);

const effectiveBossPower = computed(() =>
  crisis.value.outpostCleared
    ? Math.round(spec.value.opponent.powerScore * 0.82)
    : spec.value.opponent.powerScore,
);

const canWinDirect = computed(
  () => championPower.value.totalPower >= effectiveBossPower.value,
);

const revengeBuffDays = computed(() => {
  const rem = crisis.value.revengeBuffUntilTick - props.systemView.tick;
  return rem > 0 ? Math.ceil(rem / 12) : 0;
});

const xpThreshold = computed(() => getSystemXpThreshold(props.systemView.systemLevel));
const xpPct = computed(() =>
  Math.max(0, Math.min(100, Math.round((props.systemView.systemXp / Math.max(1, xpThreshold.value)) * 100))),
);
const hasPendingDraft = computed(() => (props.systemView.pendingPerkChoices?.length ?? 0) > 0);

const pendingEncounter = computed(() => props.systemView.pendingEncounter ?? null);
</script>

<template>
  <section class="crisis-stack" data-testid="sect-crisis-panel">
    <!-- 外挂充能进度条 & 外挂三选一入口 -->
    <div class="system-xp-bar" data-testid="system-xp-bar">
      <div class="xp-left">
        <span class="xp-lv-pill" title="给弟子塞外挂或打架都会涨充能，满格永久三选一">🎁 外挂充能 Lv.{{ systemView.systemLevel }}</span>
        <div class="xp-track">
          <div class="xp-fill" :style="{ width: `${xpPct}%` }" />
        </div>
        <span class="xp-num">{{ systemView.systemXp }}/{{ xpThreshold }}</span>
      </div>
      <button
        v-if="hasPendingDraft"
        type="button"
        class="xp-draft-btn"
        data-testid="btn-open-perk-draft"
        @click="emit('openPerkDraft')"
      >
        🎁 外挂三选一!
      </button>
    </div>

    <div v-if="systemView.activePerks.length > 0" class="active-perks-strip" data-testid="active-perks-strip">
      <span
        v-for="pid in systemView.activePerks"
        :key="pid"
        class="active-perk-chip"
        :title="SYSTEM_PERKS[pid].desc"
      >
        ✨ {{ SYSTEM_PERKS[pid].name }}
      </span>
    </div>

    <!-- 分幕生死危机卡 -->
    <article class="sect-crisis-card" :class="{ underdog: !canWinDirect, burning: daysLeft <= 5 }">
      <header class="crisis-head">
        <div class="crisis-badge-row">
          <span class="crisis-chapter-pill">{{ spec.badge }}</span>
          <span v-if="crisis.outpostCleared" class="crisis-weak-pill">✅ 前哨已拔·首领-18%</span>
          <span v-if="revengeBuffDays > 0" class="crisis-revenge-pill">
            🔥 越挫越勇 +40%（余{{ revengeBuffDays }}日）
          </span>
        </div>
        <div class="crisis-countdown" data-testid="crisis-countdown">
          <strong>余 {{ daysLeft }} 日</strong>
        </div>
      </header>

      <h3 class="crisis-title">{{ spec.title }}</h3>

      <div class="crisis-duel-row">
        <div class="crisis-fighter">
          <img
            v-if="champion"
            :src="assetUrl(resolvePortraitUrl(champion.portraitId))"
            :alt="champion.name"
          />
          <div>
            <div class="fighter-name">{{ champion?.name ?? '暂无主将' }}</div>
            <div class="fighter-power jade">
              战力 {{ championPower.totalPower }}
              <span v-if="championPower.tacticalBonus > 0" class="fighter-bonus">(契约+{{ championPower.tacticalBonus }})</span>
            </div>
          </div>
        </div>

        <span class="crisis-vs">VS</span>

        <div class="crisis-fighter enemy">
          <div>
            <div class="fighter-name">{{ spec.opponent.name }}</div>
            <div class="fighter-power crimson">
              战力 {{ effectiveBossPower }}
              <span v-if="crisis.outpostCleared" class="fighter-bonus">(-18%)</span>
            </div>
          </div>
          <img
            :src="assetUrl(resolveOpponentAvatar(spec.opponent, spec.chapterIndex))"
            :alt="spec.opponent.name"
          />
        </div>
      </div>

      <div class="crisis-foot">
        <span class="crisis-loot">🎁 爆装：{{ spec.rewardSummary }}</span>
        <div class="crisis-btn-row">
          <button
            v-if="!crisis.outpostCleared"
            type="button"
            class="crisis-outpost-btn"
            data-testid="btn-raid-outpost"
            :disabled="!champion || Boolean(systemView.activeDuel) || Boolean(systemView.pendingClutch)"
            @click="emit('raidOutpost', champion?.id)"
          >
            🎯 偷袭前哨（削Boss 18%）
          </button>
          <button
            type="button"
            class="crisis-action-btn"
            :class="{ direct: canWinDirect }"
            data-testid="btn-resolve-crisis"
            :disabled="!champion || Boolean(systemView.activeDuel) || Boolean(systemView.pendingClutch)"
            @click="emit('resolveCrisis', champion?.id)"
          >
            {{
              canWinDirect
                ? `⚔️ 轻松碾压 ${spec.opponent.name}`
                : `⚔️ 开挂迎战（差 ${effectiveBossPower - championPower.totalPower}）`
            }}
          </button>
        </div>
      </div>
    </article>

    <!-- 突发奇遇抉择卡片 -->
    <article v-if="pendingEncounter" class="parchment-card encounter-card" data-testid="encounter-card">
      <div class="encounter-head">
        <img
          class="encounter-avatar"
          :src="assetUrl(resolvePortraitUrl(pendingEncounter.portraitId))"
          :alt="pendingEncounter.actorName"
        />
        <div style="min-width: 0; flex: 1">
          <div class="encounter-title-line">
            <span class="paper-pill gold">{{ pendingEncounter.tag }}</span>
            <strong>{{ pendingEncounter.title }}</strong>
          </div>
          <p class="encounter-narrative"><RichText :text="pendingEncounter.narrative" /></p>
        </div>
      </div>
      <div class="encounter-choices">
        <button
          v-for="ch in pendingEncounter.choices"
          :key="ch.key"
          type="button"
          class="encounter-choice-btn"
          :class="ch.key === 'a' ? 'tone-a' : 'tone-b'"
          :data-testid="`btn-encounter-${ch.key}`"
          @click="emit('resolveEncounter', pendingEncounter.id, ch.key)"
        >
          <strong>{{ ch.label }}</strong>
          <span><RichText :text="ch.hint" /></span>
        </button>
      </div>
    </article>
  </section>
</template>
