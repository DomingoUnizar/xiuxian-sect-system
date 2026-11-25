<script setup lang="ts">
import { SYSTEM_PERKS } from '../../sim/destinyTraits';
import type { SystemPerkId } from '../../sim/types';
import RichText from './RichText.vue';

defineProps<{
  choices: SystemPerkId[];
  systemLevel: number;
}>();

const emit = defineEmits<{
  choose: [perkId: SystemPerkId];
  close: [];
}>();
</script>

<template>
  <div class="clutch-backdrop" role="dialog" aria-modal="true" aria-label="系统外挂三选一" data-testid="system-draft-modal">
    <article class="clutch-modal-card draft-card">
      <header class="draft-head">
        <div>
          <span class="clutch-alarm-pill draft">🎁 系统算力进阶 · Lv.{{ systemLevel + 1 }}</span>
          <h2>🎁 外挂三选一 · 永久生效</h2>
        </div>
        <button type="button" class="paper-btn subtle" @click="emit('close')">暂缓抽取</button>
      </header>

      <p class="draft-sub">选 1 个直接装进宗门，永久白嫖效果：</p>

      <div class="draft-cards-grid">
        <button
          v-for="(pid, idx) in choices"
          :key="pid"
          type="button"
          class="draft-perk-btn"
          :class="SYSTEM_PERKS[pid].rarity"
          :data-testid="`btn-pick-perk-${idx}`"
          @click="emit('choose', pid)"
        >
          <span class="draft-tag">{{ SYSTEM_PERKS[pid].tag }}</span>
          <h3>{{ SYSTEM_PERKS[pid].name }}</h3>
          <div class="draft-stat-pills">
            <span v-for="stat in SYSTEM_PERKS[pid].keyStats" :key="stat" class="draft-stat-pill">
              {{ stat }}
            </span>
          </div>
          <p><RichText :text="SYSTEM_PERKS[pid].desc" theme="dark" /></p>
          <span class="draft-cta">✨ 装载此外挂</span>
        </button>
      </div>
    </article>
  </div>
</template>
