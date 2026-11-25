<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getTraitSpec, SYSTEM_PERKS } from '../../sim/destinyTraits';
import type { ActiveDuelState, DuelCheatKind, SystemPerkId } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolveOpponentAvatar, resolvePortraitUrl } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = defineProps<{
  duel: ActiveDuelState;
  daoyuanAvailable: number;
  pillCount: number;
  activePerks?: SystemPerkId[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  step: [mode: 'one_round' | 'auto_finish'];
  cheat: [cheat: DuelCheatKind];
  close: [];
}>();

const autoPlay = ref(false);
let playTimer: number | null = null;

function stopTimer() {
  if (playTimer !== null) {
    window.clearTimeout(playTimer);
    playTimer = null;
  }
}

function toggleAutoPlay() {
  if (autoPlay.value) {
    autoPlay.value = false;
    stopTimer();
    return;
  }
  if (props.duel.status !== 'fighting') return;
  autoPlay.value = true;
  if (!props.busy) {
    emit('step', 'one_round');
  }
}

watch(
  () => [autoPlay.value, Boolean(props.busy), props.duel.status, props.duel.round] as const,
  ([running, isBusy, status]) => {
    stopTimer();
    if (status !== 'fighting') {
      autoPlay.value = false;
      return;
    }
    if (running && !isBusy) {
      playTimer = window.setTimeout(() => {
        if (autoPlay.value && !props.busy && props.duel.status === 'fighting') {
          emit('step', 'one_round');
        }
      }, 750);
    }
  },
);

onMounted(() => {
  // 默认先由玩家节奏步进或点“自动交锋/瞬战”，防止还没看清BOSS蓄力提示就打完
});
onBeforeUnmount(() => stopTimer());

const hostHpPct = computed(() =>
  Math.max(0, Math.min(100, Math.round((props.duel.hostHp / Math.max(1, props.duel.hostMaxHp)) * 100))),
);
const oppHpPct = computed(() =>
  Math.max(0, Math.min(100, Math.round((props.duel.oppHp / Math.max(1, props.duel.oppMaxHp)) * 100))),
);
const recentLogs = computed(() => [...props.duel.logs].slice(-8));
const logBoxRef = ref<HTMLElement | null>(null);

watch(
  () => props.duel.logs.length,
  () => {
    void nextTick(() => {
      if (logBoxRef.value) {
        logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight;
      }
    });
  },
);
</script>

<template>
  <div class="duel-backdrop" role="dialog" aria-modal="true" :aria-label="duel.title" data-testid="live-duel-modal">
    <article class="duel-modal-card" :class="duel.status">
      <header class="duel-head">
        <div>
          <span class="duel-round-pill">
            {{ duel.status === 'fighting' ? `第 ${duel.round} / ${duel.maxRounds} 合` : duel.status === 'victory' ? '🏆 胜负已分 · 胜利' : '💀 遗憾落败' }}
          </span>
          <h2>{{ duel.title }}</h2>
        </div>
        <button
          type="button"
          class="duel-head-close"
          data-testid="btn-duel-escape"
          @click="stopTimer(); autoPlay = false; emit('close')"
        >
          ✕ 暂离
        </button>
      </header>

      <div v-if="duel.status === 'fighting'" class="duel-casual-tip">
        💡 懒得手点直接按【⚡ 一键爽打到底】或【▶ 自动看戏】；看到红字蓄力时点【🔔 识海传音】可 0 伤反杀！
      </div>

      <div v-if="activePerks && activePerks.length > 0" class="duel-perks-strip">
        <span>✨ 生效外挂：</span>
        <span v-for="pid in activePerks" :key="pid" class="duel-perk-tag" :title="SYSTEM_PERKS[pid].desc">
          {{ SYSTEM_PERKS[pid].name }}
        </span>
      </div>

      <!-- 双方血条与命格面板 -->
      <div class="duel-arena-stage">
        <div class="duel-fighter-card host">
          <div class="duel-fighter-top">
            <img :src="assetUrl(resolvePortraitUrl(duel.actorPortraitId))" :alt="duel.actorName" />
            <div>
              <div class="duel-name">{{ duel.actorName }}</div>
              <div class="duel-stats">攻 {{ duel.hostAttack }} · 防 {{ duel.hostDefense }}</div>
            </div>
          </div>
          <div class="duel-hp-bar">
            <div class="duel-hp-fill jade" :style="{ width: `${hostHpPct}%` }" />
          </div>
          <div class="duel-hp-num">
            气血 {{ duel.hostHp }} / {{ duel.hostMaxHp }}
            <span v-if="duel.hostShield > 0" class="shield-txt">(+{{ duel.hostShield }}盾)</span>
          </div>
          <div class="duel-trait-row">
            <span v-for="tid in duel.actorTraits" :key="tid" class="duel-trait-tag" :class="getTraitSpec(tid).rarity" :title="getTraitSpec(tid).desc">
              {{ getTraitSpec(tid).name }}
            </span>
          </div>
          <div v-if="duel.dodgeAndCounterReady || duel.immortalStrikeReady" class="duel-buff-tags">
            <span v-if="duel.dodgeAndCounterReady" class="buff-pill">👁️ 下合必闪并暴击</span>
            <span v-if="duel.immortalStrikeReady" class="buff-pill gold">⚡ 剑仙一击已蓄</span>
          </div>
        </div>

        <div class="duel-center-col">
          <span class="duel-vs-badge">VS</span>
          <div v-if="duel.oppChargingUltimate && duel.status === 'fighting'" class="duel-telegraph-alert" data-testid="duel-ult-alert">
            ⚠️ 敌方正蓄力绝杀「{{ duel.oppMethod }}」! 快点识海传音破招!
          </div>
          <div v-else-if="duel.status === 'fighting'" class="duel-intent-calm">
            可用道源：<b>{{ daoyuanAvailable }} 点</b>
          </div>
        </div>

        <div class="duel-fighter-card enemy">
          <div class="duel-fighter-top">
            <img
              :src="assetUrl(resolveOpponentAvatar({ id: 'opp', name: duel.opponentName, title: duel.opponentTitle, portraitId: duel.opponentPortraitId, realm: '筑基', realmLayer: 1, powerScore: 200, maxHp: 200, attack: 30, defense: 10, evasion: 45, knownMethod: '', available: true }, duel.chapterIndex))"
              :alt="duel.opponentName"
            />
            <div>
              <div class="duel-name enemy">{{ duel.opponentName }}</div>
              <div class="duel-stats">攻 {{ duel.oppAttack }} · 防 {{ duel.oppDefense }}</div>
            </div>
          </div>
          <div class="duel-hp-bar">
            <div class="duel-hp-fill crimson" :style="{ width: `${oppHpPct}%` }" />
          </div>
          <div class="duel-hp-num">
            气血 {{ duel.oppHp }} / {{ duel.oppMaxHp }}
            <span v-if="duel.oppWeakenedByOutpost" class="weakened-txt">（前哨被拔 -18%）</span>
          </div>
          <div class="duel-opp-sub">{{ duel.opponentTitle }}</div>
        </div>
      </div>

      <!-- 实况交锋滚动区 -->
      <div ref="logBoxRef" class="duel-log-box" data-testid="duel-log-box">
        <div v-for="(entry, idx) in recentLogs" :key="idx" class="duel-log-line" :class="entry.tone">
          <RichText :text="entry.text" theme="dark" />
        </div>
      </div>

      <!-- 底部操作台：场外黑手干预 OR 胜负结算收剑 -->
      <div v-if="duel.status === 'fighting'" class="duel-controls">
        <div class="duel-cheats-grid">
          <button
            type="button"
            class="duel-cheat-btn sapphire"
            :class="{ 'pulse-counter': duel.oppChargingUltimate && duel.whisperCooldown === 0 && !duel.dodgeAndCounterReady && daoyuanAvailable >= 4 }"
            data-testid="btn-duel-whisper"
            :disabled="Boolean(busy) || duel.whisperCooldown > 0 || duel.dodgeAndCounterReady || daoyuanAvailable < 4"
            @click="emit('cheat', 'whisper_dodge')"
          >
            <div><strong>🔔 识海传音·破招</strong><em>4 道源</em></div>
            <span>{{ duel.whisperCooldown > 0 ? `调息冷却中(${duel.whisperCooldown}合)` : '闪避下合敌招并 1.85× 暴击' }}</span>
          </button>

          <button
            type="button"
            class="duel-cheat-btn jade"
            data-testid="btn-duel-pill"
            :disabled="Boolean(busy) || duel.pillsUsed >= 2 || (pillCount === 0 && daoyuanAvailable < 5)"
            @click="emit('cheat', 'secret_pill')"
          >
            <div><strong>💊 暗塞灵丹·回春</strong><em>{{ pillCount > 0 ? `耗1丹(余${pillCount})` : '5 道源' }}</em></div>
            <span>瞬回 38% 气血（限2次·百毒体加攻）</span>
          </button>

          <button
            type="button"
            class="duel-cheat-btn gold"
            data-testid="btn-duel-strike"
            :disabled="Boolean(busy) || duel.strikeUsed || duel.immortalStrikeReady || daoyuanAvailable < 10"
            @click="emit('cheat', 'sword_immortal_strike')"
          >
            <div><strong>⚡ 借剑仙一击</strong><em>10 道源</em></div>
            <span>{{ duel.strikeUsed ? '本场已动用' : '下合 2.35× 无视护甲暴斩' }}</span>
          </button>

          <button
            type="button"
            class="duel-cheat-btn crimson"
            data-testid="btn-duel-lifespan"
            :disabled="Boolean(busy) || duel.burnedLifespanUsed"
            @click="emit('cheat', 'burn_lifespan')"
          >
            <div><strong>🩸 燃十五载寿元</strong><em>0 道源</em></div>
            <span>{{ duel.burnedLifespanUsed ? '本场已焚寿' : '回血30%且本战攻击永久+35%' }}</span>
          </button>
        </div>

        <div class="duel-action-row">
          <button
            type="button"
            class="duel-step-main-btn"
            data-testid="btn-duel-step"
            :disabled="Boolean(busy)"
            @click="emit('step', 'one_round')"
          >
            {{ busy ? '⚔️ 交锋中' : `⚔️ 推进第 ${duel.round + 1} 合` }}
          </button>
          <button
            type="button"
            class="duel-auto-btn"
            :class="{ active: autoPlay }"
            data-testid="btn-duel-autoplay"
            @click="toggleAutoPlay"
          >
            {{ autoPlay ? '⏸ 暂停看戏' : '▶ 自动看戏' }}
          </button>
          <button
            type="button"
            class="duel-autofinish-btn"
            data-testid="btn-duel-autofinish"
            @click="stopTimer(); autoPlay = false; emit('step', 'auto_finish')"
          >
            ⚡ 一键爽打到底
          </button>
        </div>
      </div>

      <div v-else class="duel-result-footer">
        <p class="duel-result-headline"><RichText :text="duel.resultHeadline ?? ''" theme="dark" /></p>
        <button
          type="button"
          class="duel-step-main-btn victory"
          data-testid="btn-duel-close"
          @click="emit('close')"
        >
          {{ duel.status === 'victory' ? '🏆 凯旋收剑 · 看全宗轰动反应' : '收剑回山 · 立誓雪耻' }}
        </button>
      </div>
    </article>
  </div>
</template>
