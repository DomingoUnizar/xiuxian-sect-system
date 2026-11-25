<script setup lang="ts">
import { ref } from 'vue';
import { formatWorldTime } from '../../sim/time';
import type { AlchemyFact, BattleFact, Fact } from '../../sim/types';
import RichText from './RichText.vue';

defineProps<{
  mode: 'system' | 'host' | 'public';
  facts: Fact[];
  publicFacts?: Array<{
    id: string;
    tick: number;
    type: string;
    summary: string;
    battleFactId?: string;
    alchemyFactId?: string;
  }>;
  battleFacts: Record<string, BattleFact>;
  alchemyFacts: Record<string, AlchemyFact>;
}>();

const expandedFactIds = ref<Record<string, boolean>>({});

function toggleExpand(id: string) {
  expandedFactIds.value[id] = !expandedFactIds.value[id];
}
</script>

<template>
  <section class="parchment-card" data-testid="chronicle-panel">
    <header class="card-header">
      <div>
        <h2 class="card-title">
          {{
            mode === 'system'
              ? '系统全览纪事（含秘令与奖账）'
              : mode === 'host'
                ? '单宿主视角所见（保密隔离）'
                : '宗门公开纪事（旁人只见实事）'
          }}
        </h2>
        <p class="card-sub">
          {{
            mode === 'public'
              ? '同门与外客仅可见成丹、胜负、吐纳与拜山等宗门实事经过'
              : '可点击每条丹炉、切磋事件展开详细过程'
          }}
        </p>
      </div>
      <span class="paper-pill">{{ mode === 'public' ? (publicFacts?.length ?? 0) : facts.length }} 条</span>
    </header>

    <div v-if="mode === 'public'" class="records-list">
      <article v-for="pf in [...(publicFacts ?? [])].reverse().slice(0, 35)" :key="pf.id" class="record-row">
        <div class="record-top">
          <span class="micro-badge">{{ formatWorldTime(pf.tick).formatted }}</span>
          <button
            v-if="
              (pf.battleFactId && battleFacts[pf.battleFactId]?.detailedReport) ||
              (pf.alchemyFactId && alchemyFacts[pf.alchemyFactId]?.detailedReport)
            "
            type="button"
            class="paper-btn subtle"
            @click="toggleExpand(pf.id)"
          >
            {{ expandedFactIds[pf.id] ? '收起详报' : '展开详报' }}
          </button>
        </div>
        <div class="record-body"><RichText :text="pf.summary" /></div>
        <div
          v-if="
            expandedFactIds[pf.id] &&
            ((pf.battleFactId && battleFacts[pf.battleFactId]?.detailedReport) ||
              (pf.alchemyFactId && alchemyFacts[pf.alchemyFactId]?.detailedReport))
          "
          class="detail-pre"
        ><RichText :text="(pf.battleFactId ? battleFacts[pf.battleFactId]?.detailedReport : alchemyFacts[pf.alchemyFactId!]?.detailedReport) ?? ''" /></div>
      </article>
    </div>

    <div v-else class="records-list">
      <article
        v-for="f in [...facts].reverse().slice(0, 45)"
        :key="f.id"
        class="record-row"
        :data-testid="`fact-item-${f.type}`"
      >
        <div class="record-top">
          <div class="host-tags-strip">
            <span class="micro-badge">{{ formatWorldTime(f.tick).formatted }}</span>
            <span class="micro-badge" :class="f.visibility === 'host_private' ? 'gold' : ''">
              {{ f.visibility === 'host_private' ? '宿主私令' : f.visibility === 'system_only' ? '系统专属' : '宗门实事' }}
            </span>
          </div>
          <button
            v-if="f.battleFactId || f.alchemyFactId || f.details"
            type="button"
            class="paper-btn subtle"
            @click="toggleExpand(f.id)"
          >
            {{ expandedFactIds[f.id] ? '收起经过' : '展开因果' }}
          </button>
        </div>

        <div class="record-body">
          <RichText :text="mode === 'host' ? (f.privateSummary ?? f.publicSummary ?? f.systemSummary) : f.systemSummary" />
        </div>

        <div v-if="mode === 'system' && f.privateSummary && f.privateSummary !== f.systemSummary" class="record-sub">
          <RichText :text="`宿主私令原文：${f.privateSummary}`" />
        </div>

        <div
          v-if="expandedFactIds[f.id] && (f.battleFactId || f.alchemyFactId || f.details)"
          class="detail-pre"
        ><RichText :text="(f.battleFactId ? battleFacts[f.battleFactId]?.detailedReport : f.alchemyFactId ? alchemyFacts[f.alchemyFactId]?.detailedReport : f.details) ?? ''" /></div>
      </article>
    </div>
  </section>
</template>
