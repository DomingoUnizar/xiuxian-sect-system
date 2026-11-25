<script setup lang="ts">
import { computed } from 'vue';
import type { ClutchChoiceKey, PendingClutchCrisis } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolveOpponentAvatar, resolvePortraitUrl } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = defineProps<{
  clutch: PendingClutchCrisis;
  daoyuanAvailable: number;
}>();

const emit = defineEmits<{
  resolve: [clutchId: string, choice: ClutchChoiceKey];
}>();

const isBacklash = computed(() => props.clutch.kind === 'tiger_backlash');
</script>

<template>
  <div class="clutch-backdrop" role="dialog" aria-modal="true" :aria-label="clutch.title" data-testid="clutch-modal">
    <article class="clutch-modal-card">
      <header class="clutch-head">
        <span class="clutch-alarm-pill">⚡ 绝境定格 · 等待拍板</span>
        <h2>{{ clutch.title }}</h2>
      </header>

      <div class="clutch-stage-avatars">
        <div class="clutch-portrait-box">
          <img :src="assetUrl(resolvePortraitUrl(clutch.actorPortraitId))" :alt="clutch.actorName" />
          <span>{{ clutch.actorName }}</span>
        </div>
        <span v-if="clutch.opponentName" class="clutch-clash-bolt">⚡ 生死一线 ⚡</span>
        <div v-if="clutch.opponentName && clutch.opponentPortraitId" class="clutch-portrait-box enemy">
          <img :src="assetUrl(resolveOpponentAvatar({ id: 'opp', name: clutch.opponentName, title: clutch.opponentTitle ?? '', portraitId: clutch.opponentPortraitId, realm: '筑基', realmLayer: 1, powerScore: 200, maxHp: 200, attack: 30, defense: 10, evasion: 45, knownMethod: '', available: true }, 0))" :alt="clutch.opponentName" />
          <span>{{ clutch.opponentName }}</span>
        </div>
      </div>

      <ol class="clutch-beats">
        <li v-for="(beat, idx) in clutch.beats" :key="idx">
          <RichText :text="beat" theme="dark" />
        </li>
      </ol>

      <p class="clutch-prompt"><RichText :text="clutch.crisisPrompt" theme="dark" /></p>

      <div class="clutch-daoyuan-bar">
        可用道源：<strong>{{ props.daoyuanAvailable }} 点</strong>（关键神权只留在此刻动用）
      </div>

      <div class="clutch-choices-grid">
        <button
          type="button"
          class="clutch-choice-btn gold"
          data-testid="btn-clutch-future"
          :disabled="props.daoyuanAvailable < clutch.futureCost"
          @click="emit('resolve', clutch.id, 'future_strike')"
        >
          <div class="clutch-btn-top">
            <strong>⚡ 借一式未来身</strong>
            <em>{{ clutch.futureCost }} 道源</em>
          </div>
          <span>{{ isBacklash ? '强压反噬化煞成龙，修为大涨并悟出《惊雷破邪诀》' : '瞬发十年后绝杀剑意当场反杀！并领悟新剑诀' }}</span>
        </button>

        <button
          type="button"
          class="clutch-choice-btn jade"
          data-testid="btn-clutch-aegis"
          :disabled="props.daoyuanAvailable < clutch.aegisCost"
          @click="emit('resolve', clutch.id, 'immortal_aegis')"
        >
          <div class="clutch-btn-top">
            <strong>🛡️ 九息不灭金身</strong>
            <em>{{ clutch.aegisCost }} 道源</em>
          </div>
          <span>{{ isBacklash ? '护住心脉稳吞残煞，回满状态修为大涨' : '九息伤害归零反震击溃强敌，回满状态稳赚不亏' }}</span>
        </button>

        <button
          type="button"
          class="clutch-choice-btn crimson"
          data-testid="btn-clutch-lifespan"
          @click="emit('resolve', clutch.id, 'burn_lifespan')"
        >
          <div class="clutch-btn-top">
            <strong>🩸 暗燃十五载寿元</strong>
            <em>0 道源</em>
          </div>
          <span>{{ isBacklash ? '一毛道源不花，逼他自燃寿元硬吞猛药' : '一毛道源不花，逼宿主自燃寿元拼死赢下这一局' }}</span>
        </button>

        <button
          type="button"
          class="clutch-choice-btn slate"
          data-testid="btn-clutch-watch"
          @click="emit('resolve', clutch.id, 'watch_coldly')"
        >
          <div class="clutch-btn-top">
            <strong>👁️ 冷眼旁观顺天命</strong>
            <em>0 道源</em>
          </div>
          <span>{{ isBacklash ? '省下道源让他闭门调养，无额外消耗' : '全宗触发「越挫越勇」+40% 修速并领 +10 道源补贴' }}</span>
        </button>
      </div>
    </article>
  </div>
</template>
