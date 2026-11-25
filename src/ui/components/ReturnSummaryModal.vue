<script setup lang="ts">
import { computed } from 'vue';
import { pickReturnOpening, type ReturnMood } from '../../content/narrativePools';
import { getItemById } from '../../content/validate';
import { computeMemberPowerScore } from '../../sim/power';
import type { SystemView } from '../../sim/types';
import type { CatchUpReport } from '../../worker/protocol';
import { assetUrl } from '../assetUrl';
import { resolvePortraitUrl } from '../visuals/assetRegistry';
import { resolveRealmTierClass } from '../visuals/richText';
import RichText from './RichText.vue';

const props = defineProps<{
  report: CatchUpReport;
  systemView: SystemView;
}>();

const emit = defineEmits<{
  close: [];
  focusMember: [memberId: string];
}>();

const recentAlchemySummary = computed(() => {
  const all = Object.values(props.systemView.alchemyFacts).filter((a) => a.success);
  if (all.length === 0) return [];
  return all.slice(-3).reverse().map((a) => {
    const actor = props.systemView.members.find((m) => m.id === a.actorId)?.name ?? a.actorId;
    return `${actor} 依「${a.recipeName}」炼成丹药：${a.destinationNote}`;
  });
});

const vaultSummary = computed(() => {
  const entries = Object.entries(props.systemView.inventory.pills).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return '当前宗门丹库成品已配发同门使用';
  return entries.map(([id, qty]) => `${getItemById(id)?.name ?? id} × ${qty}`).join('、');
});

const activeDisciples = computed(() =>
  [...props.systemView.members].filter((m) => m.role === 'disciple' && m.status === 'active').reverse(),
);

const moodHint = computed<ReturnMood>(() => {
  if (recentAlchemySummary.value.length >= 2) return 'alchemy_boom';
  if (Object.keys(props.systemView.battleFacts).length >= 2) return 'arena_fervor';
  if (activeDisciples.value.length >= 2) return 'new_disciples';
  return 'calm';
});

const openingLine = computed(() =>
  pickReturnOpening(
    props.report.ticksSimulated,
    moodHint.value,
    `${props.systemView.seed}:${props.report.fromTick}:${props.report.toTick}`,
  ),
);

const elapsedLabel = computed(() => {
  const sec = Math.max(1, Math.round(props.report.wallElapsedMs / 1000));
  if (sec < 60) return `${sec} 秒`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} 分钟` : `${(min / 60).toFixed(1)} 小时`;
});

const missionSummaryText = computed(() => {
  const parts: string[] = [];
  if (props.report.missionsCompleted > 0) parts.push(`兑现 ${props.report.missionsCompleted} 道`);
  if (props.report.autoMissionsIssued > 0) parts.push(`自动签发 ${props.report.autoMissionsIssued} 道`);
  if (props.report.missionsInProgress > 0) parts.push(`履约中 ${props.report.missionsInProgress} 道`);
  if (props.report.missionsDeclinedOrExpired > 0) parts.push(`推辞/到期 ${props.report.missionsDeclinedOrExpired} 道`);
  return parts.length > 0
    ? `弟子履约：${parts.join(' · ')}`
    : '山门一切平稳，众弟子一直在默默苦修积攒灵气';
});
</script>

<template>
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="离山归来简报"
    data-testid="return-summary-modal"
    @click.self="emit('close')"
  >
    <div class="parchment-modal">
      <div class="modal-mood-banner">
        <img :src="assetUrl('assets/scenes/17_star_platform.webp')" alt="离山归来星台" />
        <div class="modal-mood-text">
          <h2>离山归来 · 宗门运转简报</h2>
          <span class="paper-pill gold">补算 {{ report.ticksSimulated }} 刻</span>
        </div>
      </div>

      <div class="modal-body-pad">
        <blockquote class="return-opening-quote" data-testid="return-opening-quote">
          {{ openingLine }}
        </blockquote>

        <div v-if="report.clockWarning" class="warn-hint" style="margin-bottom: 10px">
          {{ report.clockWarning }}
        </div>

        <div class="record-row" style="margin-bottom: 10px">
          <div class="record-body">
            离山 {{ elapsedLabel }} · 山门共运转 {{ report.ticksSimulated }} 刻
          </div>
          <div class="record-sub" data-testid="return-mission-counts">
            {{ missionSummaryText }}
          </div>
        </div>

        <div class="record-row" style="margin-bottom: 10px" data-testid="return-pill-whereabouts">
          <strong>丹药去了哪里</strong>
          <div class="record-sub"><RichText :text="`当前宗门丹库：${vaultSummary}`" /></div>
          <ul v-if="recentAlchemySummary.length > 0" class="ledger-ul">
            <li v-for="line in recentAlchemySummary" :key="line"><RichText :text="line" /></li>
          </ul>
        </div>

        <div class="record-row" style="margin-bottom: 10px" data-testid="return-disciple-growth">
          <strong>弟子长进了多少（可直接选中发下一道密令）</strong>
          <div v-if="activeDisciples.length === 0" class="empty-note">当前尚无在籍外门弟子。</div>
          <div v-else class="return-growth-list">
            <div v-for="d in activeDisciples" :key="d.id" class="return-growth-row">
              <div class="return-disciple-left">
                <img :src="assetUrl(resolvePortraitUrl(d.portraitId))" :alt="d.name" />
                <div>
                  <strong class="rt-name">{{ d.name }}</strong>
                  <div class="record-sub">
                    <b :class="resolveRealmTierClass(d.realm)">{{ d.realm }}{{ d.realmLayer }}层</b> · 修为 <b class="rt-stat-amber">{{ d.cultivation }}/{{ d.cultivationCap }} 缕</b> · <b class="rt-stat-power">战力 {{ computeMemberPowerScore(d) }}</b>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="cta-nephrite-btn"
                :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
                :data-testid="`btn-return-next-${d.id}`"
                @click="emit('focusMember', d.id)"
              >
                去照看他
              </button>
            </div>
          </div>
        </div>

        <div v-if="report.highlightFacts.length > 0" class="record-row" style="margin-bottom: 12px">
          <strong>离山期间重点回执</strong>
          <ul class="ledger-ul">
            <li v-for="hf in report.highlightFacts.slice(-5).reverse()" :key="hf.id">
              <RichText :text="hf.privateSummary ?? hf.publicSummary ?? hf.systemSummary" />
            </li>
          </ul>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="paper-btn active"
            style="min-height: 44px; padding: 8px 20px; font-size: 0.88rem"
            data-testid="btn-close-return-modal"
            @click="emit('close')"
          >
            收下收获，回到山门
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
