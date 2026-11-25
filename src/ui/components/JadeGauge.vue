<script setup lang="ts">
import { computed } from 'vue';
import { assetUrl } from '../assetUrl';

const props = defineProps<{
  label: string;
  current: number;
  max: number;
  kind: 'hp' | 'qi' | 'exp';
  extraTestId?: string;
}>();

const pct = computed(() => {
  if (props.max <= 0) return 0;
  return Math.max(0, Math.min(100, (props.current / props.max) * 100));
});

const fillPath = computed(() => {
  if (props.kind === 'hp') return assetUrl('assets/ui/fill_hp.png');
  if (props.kind === 'qi') return assetUrl('assets/ui/fill_qi.png');
  return assetUrl('assets/ui/fill_exp.png');
});

function formatGaugeVal(val: number): string {
  if (Math.abs(val) >= 100_000) {
    return `${(val / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(Math.round(val));
}
</script>

<template>
  <div class="jade-gauge" :class="`gauge-kind-${kind}`" :data-testid="`gauge-${kind}`">
    <div class="jade-gauge-header">
      <span class="jade-gauge-label">{{ label }}</span>
      <span class="jade-gauge-val mono" :data-testid="extraTestId">{{ formatGaugeVal(current) }} / {{ formatGaugeVal(max) }}</span>
    </div>
    <div class="jade-gauge-track">
      <div class="jade-gauge-fill-clip" :style="{ width: `${pct * 0.75}%` }">
        <img class="jade-gauge-fill-img" :src="fillPath" alt="" aria-hidden="true" />
      </div>
      <img
        class="jade-gauge-frame"
        :src="assetUrl('assets/ui/celestial_jade_bar.png')"
        alt=""
        aria-hidden="true"
      />
    </div>
  </div>
</template>
