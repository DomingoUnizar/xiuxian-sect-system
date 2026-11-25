<script setup lang="ts">
import { computed } from 'vue';
import type { SystemView } from '../../sim/types';

const props = defineProps<{
  systemView: SystemView;
  autoDispatchEnabled: boolean;
}>();

const emit = defineEmits<{
  quickScheme: [];
  openPerkDraft: [];
  goFight: [];
  toggleAuto: [];
  dismiss: [];
}>();

const step1Done = computed(() => (props.systemView.dramaLogs?.length ?? 0) >= 1);
const step2Done = computed(() => props.systemView.activePerks.length >= 1);
const hasPendingDraft = computed(() => (props.systemView.pendingPerkChoices?.length ?? 0) > 0);
const step3Done = computed(
  () =>
    props.systemView.sectCrisis.chapterIndex >= 1 ||
    Boolean(props.systemView.sectCrisis.outpostCleared),
);
const allDone = computed(() => step1Done.value && step2Done.value && step3Done.value);
</script>

<template>
  <section class="parchment-card starter-banner-card" data-testid="casual-starter-banner">
    <header class="starter-banner-head">
      <div class="starter-banner-title">
        <span class="paper-pill gold">{{ allDone ? '🎉 已上手' : '30秒上手' }}</span>
        <strong>{{ allDone ? '已摸透爽游套路！可躺着挂机或继续点着玩' : '开局 3 步轻松爽玩' }}</strong>
      </div>
      <div class="starter-banner-actions">
        <button
          type="button"
          class="starter-auto-btn"
          :class="{ active: autoDispatchEnabled }"
          data-testid="btn-starter-auto"
          @click="emit('toggleAuto')"
        >
          {{ autoDispatchEnabled ? '🤖 佛系挂机中' : '🤖 开启佛系挂机' }}
        </button>
        <button
          type="button"
          class="starter-dismiss-btn"
          data-testid="btn-starter-dismiss"
          @click="emit('dismiss')"
        >
          收起指引
        </button>
      </div>
    </header>

    <p class="starter-banner-sub">
      你是全宗秘密共享的修仙外挂：暗塞外挂看弟子脑补飙戏，养肥后暴打上门送装备的反派！
    </p>

    <div class="starter-steps-grid">
      <button
        type="button"
        class="starter-step-btn"
        :class="{ done: step1Done, highlight: !step1Done }"
        data-testid="starter-step-1"
        @click="emit('quickScheme')"
      >
        <div class="step-top">
          <span class="step-badge">{{ step1Done ? '✓' : '1' }}</span>
          <strong>点一次暗塞外挂</strong>
        </div>
        <span>{{ step1Done ? '已触发脑补剧场，可继续狂点' : '免费看弟子飙戏 + 立刻涨战力' }}</span>
      </button>

      <button
        type="button"
        class="starter-step-btn"
        :class="{ done: step2Done, highlight: step1Done && !step2Done }"
        data-testid="starter-step-2"
        @click="hasPendingDraft ? emit('openPerkDraft') : emit('quickScheme')"
      >
        <div class="step-top">
          <span class="step-badge">{{ step2Done ? '✓' : '2' }}</span>
          <strong>抽一个永久外挂</strong>
        </div>
        <span>
          {{
            step2Done
              ? '已激活全局强力外挂！'
              : hasPendingDraft
                ? '🎁 充能已满！点此三选一'
                : '再放 1 次外挂即满充能抽卡'
          }}
        </span>
      </button>

      <button
        type="button"
        class="starter-step-btn"
        :class="{ done: step3Done, highlight: step2Done && !step3Done }"
        data-testid="starter-step-3"
        @click="emit('goFight')"
      >
        <div class="step-top">
          <span class="step-badge">{{ step3Done ? '✓' : '3' }}</span>
          <strong>{{ systemView.sectCrisis.outpostCleared ? '暴打当前幕反派' : '奇袭前哨/暴打反派' }}</strong>
        </div>
        <span>
          {{
            step3Done
              ? '已拔前哨/破局！点此迎战大 Boss'
              : '先打前哨白赚 12 道源并削弱 Boss'
          }}
        </span>
      </button>
    </div>
  </section>
</template>
