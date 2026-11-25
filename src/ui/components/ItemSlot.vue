<script setup lang="ts">
import { computed } from 'vue';
import { assetUrl } from '../assetUrl';
import { RARITY_FRAME_MAP, type RarityFrameKey } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = withDefaults(
  defineProps<{
    iconPath: string;
    label: string;
    rarity?: RarityFrameKey;
    count?: number | string;
    subtitle?: string;
    size?: number;
    compact?: boolean;
  }>(),
  {
    rarity: 'wood',
    size: 54,
    compact: false,
  },
);

const framePath = computed(() => assetUrl(RARITY_FRAME_MAP[props.rarity] ?? RARITY_FRAME_MAP.wood));
</script>

<template>
  <div
    class="item-slot-wrap"
    :class="{ compact }"
    :title="subtitle ? `${label} · ${subtitle}` : label"
  >
    <div class="item-slot-box" :style="{ width: `${size}px`, height: `${size}px` }">
      <img class="item-slot-frame" :src="framePath" alt="" aria-hidden="true" />
      <img class="item-slot-icon" :src="assetUrl(iconPath)" :alt="label" />
      <span v-if="count !== undefined" class="item-slot-count">×{{ count }}</span>
    </div>
    <div v-if="!compact" class="item-slot-meta">
      <div class="item-slot-title" :class="`rarity-title-${rarity}`">{{ label }}</div>
      <div v-if="subtitle" class="item-slot-sub"><RichText :text="subtitle" /></div>
    </div>
  </div>
</template>
