<script setup lang="ts">
import { computed } from 'vue';
import { formatWorldTime } from '../../sim/time';
import type { SectFocus, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';

export type WatchSpeed = 0 | 1 | 2 | 5;

const props = defineProps<{
  systemView: SystemView | null;
  revision: number;
  watchSpeed: WatchSpeed;
  tickProgress: number;
  bgmEnabled: boolean;
  trackLabel: string;
  muted: boolean;
  reducedMotion: boolean;
}>();

const emit = defineEmits<{
  (e: 'set-focus', focus: SectFocus): void;
  (e: 'set-speed', speed: WatchSpeed): void;
  (e: 'step-ticks', delta: number): void;
  (e: 'toggle-auto-dispatch'): void;
  (e: 'toggle-bgm'): void;
  (e: 'next-bgm'): void;
  (e: 'toggle-mute'): void;
  (e: 'toggle-motion'): void;
  (e: 'open-save'): void;
}>();

const worldTimeText = computed(() => {
  if (!props.systemView) return '正在接入道统';
  return formatWorldTime(props.systemView.tick).formatted;
});

const totalStones = computed(() => props.systemView?.inventory.spiritStones.low ?? 0);
</script>

<template>
  <header class="hud-topbar">
    <div class="hud-left">
      <img
        class="hud-orb"
        :src="assetUrl('assets/ui/celestial_jade_orb.webp')"
        alt="宗门道统灵珠"
      />
      <div class="hud-brand-copy">
        <div class="hud-title-row">
          <h1 class="hud-title">{{ systemView?.sectName ?? '开山中' }}</h1>
        </div>
        <div class="hud-clock" data-testid="world-clock">
          <span>{{ worldTimeText }}</span>
          <span v-if="watchSpeed > 0" class="hud-tick-progress" title="流逝进度">
            <span class="hud-tick-fill" :style="{ width: `${Math.round(tickProgress * 100)}%` }" />
          </span>
        </div>
      </div>
    </div>

    <div class="hud-resources" v-if="systemView">
      <div class="hud-pill gold" data-testid="daoyuan-pill" title="道源：暗塞外挂和赏赐用的点数，每日自动涨">
        <img :src="assetUrl('assets/icons/jewels-01.png')" alt="" aria-hidden="true" />
        <span>
          道源 <strong class="hud-v-jade">{{ systemView.daoyuanAvailable }}</strong>
          <em v-if="systemView.daoyuanReserved > 0">(留{{ systemView.daoyuanReserved }})</em>
        </span>
      </div>
      <div class="hud-pill subtle" title="宗门下品灵石储备">
        <span>灵石 <strong class="hud-v-amber">{{ totalStones }}</strong></span>
      </div>
      <div class="hud-pill" data-testid="foundation-pill" title="根基：传承与击败反派积累的点数，用于解锁系统特权">
        <img :src="assetUrl('assets/ui/shared_gold_formation_symbol.webp')" alt="" aria-hidden="true" />
        <span>根基 <strong class="hud-v-gold">{{ systemView.foundationPoints }}</strong></span>
      </div>
    </div>

    <div class="hud-controls">
      <div class="speed-group" role="group" aria-label="挂机观赏流速控制">
        <button
          type="button"
          class="hud-btn"
          :class="{ active: watchSpeed === 0 }"
          data-testid="btn-auto-pause"
          @click="emit('set-speed', watchSpeed === 0 ? 1 : 0)"
        >
          {{ watchSpeed === 0 ? '继续' : '暂停' }}
        </button>
        <button
          type="button"
          class="hud-btn"
          :class="{ active: watchSpeed === 1 }"
          data-testid="speed-1x"
          @click="emit('set-speed', 1)"
        >
          1x
        </button>
        <button
          type="button"
          class="hud-btn"
          :class="{ active: watchSpeed === 2 }"
          data-testid="speed-2x"
          @click="emit('set-speed', 2)"
        >
          2x
        </button>
        <button
          type="button"
          class="hud-btn"
          :class="{ active: watchSpeed === 5 }"
          data-testid="speed-5x"
          @click="emit('set-speed', 5)"
        >
          5x
        </button>
      </div>

      <button
        v-if="systemView"
        type="button"
        class="hud-btn auto-dispatch-btn"
        :class="{ active: systemView.autoDispatchEnabled }"
        data-testid="btn-auto-dispatch"
        title="开启后系统自动发外挂、派炼丹试剑并攒充能，躺着看戏变强"
        @click="emit('toggle-auto-dispatch')"
      >
        {{ systemView.autoDispatchEnabled ? '🤖 挂机中' : '🤖 佛系挂机' }}
      </button>

      <button
        type="button"
        class="hud-cta-btn"
        :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_button.webp')})` }"
        data-testid="btn-step-3"
        @click="emit('step-ticks', 3)"
      >
        快进
      </button>
      <button
        type="button"
        class="hud-btn"
        data-testid="btn-step-day"
        @click="emit('step-ticks', 12)"
      >
        +1日
      </button>

      <button
        type="button"
        class="hud-btn"
        data-testid="btn-save-modal"
        @click="emit('open-save')"
      >
        ⚙️ 设置
      </button>
    </div>
  </header>
</template>
