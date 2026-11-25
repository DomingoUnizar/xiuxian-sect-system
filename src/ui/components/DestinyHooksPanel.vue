<script setup lang="ts">
import { computed } from 'vue';
import { estimateBreakthroughChance, isAtRealmPeak } from '../../sim/breakthrough';
import { pickBestPillInVault, pickRecommendedMethodForHost } from '../../sim/missions';
import type { MissionTargetType, RewardKind, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolvePortraitUrl } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

export interface HookActionPayload {
  type: 'prepare_mission' | 'issue_now' | 'consume_pill' | 'go_tab';
  memberId?: string;
  targetType?: MissionTargetType;
  rewardKind?: RewardKind;
  rewardItemId?: string;
  rewardMethodId?: string;
  tab?: 'recruit' | 'heritage' | 'vault';
}

interface DestinyHookCard {
  id: string;
  tag: string;
  title: string;
  reason: string;
  actionLabel: string;
  secondaryLabel?: string;
  tone: 'gold' | 'urgent' | 'jade';
  portraitId?: string;
  primaryPayload: HookActionPayload;
  secondaryPayload?: HookActionPayload;
}

const props = defineProps<{
  systemView: SystemView;
}>();

const emit = defineEmits<{
  triggerHook: [payload: HookActionPayload];
  resolveEncounter: [encounterId: string, choice: 'a' | 'b'];
}>();

const phenomenon = computed(() => props.systemView.activePhenomenon ?? null);

const phenomenonIcon = computed(() => {
  const kind = phenomenon.value?.kind;
  if (kind === 'spirit_tide') return '🌊';
  if (kind === 'challenger_at_gate') return '⚔️';
  if (kind === 'earth_fire_surge') return '🔥';
  if (kind === 'spring_mist_bloom') return '🌫️';
  return '⏳';
});

const activeMembers = computed(() =>
  props.systemView.members.filter((m) => m.status === 'active' && m.binding.bound),
);

function hasActiveMission(memberId: string, targetType?: MissionTargetType): boolean {
  return props.systemView.missions.some(
    (m) =>
      m.recipientId === memberId &&
      (m.status === 'issued' || m.status === 'accepted') &&
      (!targetType || m.targetType === targetType),
  );
}

const hookCards = computed<DestinyHookCard[]>(() => {
  const cards: DestinyHookCard[] = [];
  const members = activeMembers.value;
  const bestPill = pickBestPillInVault(props.systemView);

  // 1. 山门外敌叩山急令
  if (phenomenon.value?.kind === 'challenger_at_gate' && phenomenon.value.challenger) {
    const fighter =
      [...members]
        .filter((m) => m.injuries.length === 0 && !hasActiveMission(m.id, 'challenge_gate_duel'))
        .sort((a, b) => b.cultivation + b.aptitude.bone - (a.cultivation + a.aptitude.bone))[0] ??
      members[0];
    if (fighter) {
      const recMethod = pickRecommendedMethodForHost(fighter, 'challenge_gate_duel');
      cards.push({
        id: 'hook-gate-challenger',
        tag: '护山急令',
        title: `迎战叩山强敌 · 推选 ${fighter.name}`,
        reason: `${phenomenon.value.challenger.name}（战力 ${phenomenon.value.challenger.powerScore}）山门叫阵！胜出额外赚声望与灵石。`,
        actionLabel: '点将布局',
        secondaryLabel: props.systemView.daoyuanAvailable >= 6 ? '⚡ 立即密发' : undefined,
        tone: 'urgent',
        portraitId: fighter.portraitId,
        primaryPayload: {
          type: 'prepare_mission',
          memberId: fighter.id,
          targetType: 'challenge_gate_duel',
          rewardKind: recMethod && props.systemView.daoyuanAvailable >= 8 ? 'method_unlock' : 'cultivation_rounds',
          rewardMethodId: recMethod ?? undefined,
        },
        secondaryPayload:
          props.systemView.daoyuanAvailable >= 6
            ? {
                type: 'issue_now',
                memberId: fighter.id,
                targetType: 'challenge_gate_duel',
                rewardKind: 'cultivation_rounds',
              }
            : undefined,
      });
    }
  }

  // 2. 有人卡在九层圆满，可冲大境界
  const peakHost = members.find((m) => isAtRealmPeak(m) && !hasActiveMission(m.id, 'realm_breakthrough'));
  if (peakHost) {
    const est = estimateBreakthroughChance(props.systemView, peakHost);
    cards.push({
      id: `hook-breakthrough-${peakHost.id}`,
      tag: '破境天机',
      title: `${peakHost.name} · 冲「${est.nextRealm}」`,
      reason: `成功率 ${est.chance}%${est.hasHumaiBoost ? '（护脉已备）' : ''}`,
      actionLabel: '密令冲关',
      secondaryLabel: props.systemView.daoyuanAvailable >= 8 ? '⚡ 催闭关' : undefined,
      tone: 'gold',
      portraitId: peakHost.portraitId,
      primaryPayload: {
        type: 'prepare_mission',
        memberId: peakHost.id,
        targetType: 'realm_breakthrough',
        rewardKind: bestPill ? 'pill_grant' : 'cultivation_rounds',
        rewardItemId: bestPill ?? undefined,
      },
      secondaryPayload:
        props.systemView.daoyuanAvailable >= 8
          ? {
              type: 'issue_now',
              memberId: peakHost.id,
              targetType: 'realm_breakthrough',
              rewardKind: 'cultivation_rounds',
            }
          : undefined,
    });
  }

  // 3. 有人带伤且丹库有药 -> 雪中送炭
  const injuredHost = members.find((m) => m.injuries.length > 0 || m.hp < m.maxHp * 0.6);
  if (injuredHost && bestPill) {
    cards.push({
      id: `hook-heal-${injuredHost.id}`,
      tag: '雪中送炭',
      title: `${injuredHost.name} 带伤可赐丹`,
      reason: `${injuredHost.injuries[0] ?? '气血微亏'} · 赐丹清伤涨修为`,
      actionLabel: '💊 赐丹',
      tone: 'jade',
      portraitId: injuredHost.portraitId,
      primaryPayload: {
        type: 'consume_pill',
        memberId: injuredHost.id,
        rewardItemId: bestPill,
      },
    });
  }

  // 4. 新秀押宝或道统冲阶
  const rookie = [...members]
    .reverse()
    .find(
      (m) =>
        m.role === 'disciple' &&
        (!m.hasCompletedFirstAlchemy || !m.hasWonFirstArena) &&
        !hasActiveMission(m.id),
    );
  if (rookie && cards.length < 1) {
    const pickTarget: MissionTargetType =
      rookie.hasAlchemyFire && !rookie.hasCompletedFirstAlchemy && (props.systemView.inventory.herbs.herb_ningling ?? 0) >= 2
        ? 'first_alchemy'
        : !rookie.hasWonFirstArena
          ? 'first_arena_win'
          : 'followup_wild_expedition';
    const recMethod = pickRecommendedMethodForHost(rookie, pickTarget);
    cards.push({
      id: `hook-rookie-${rookie.id}`,
      tag: '新秀押宝',
      title: `${rookie.name} · ${pickTarget === 'first_alchemy' ? '开炉首炼' : '试剑首胜'}`,
      reason: `首令可赐十轮灌顶或玄功`,
      actionLabel: '点将',
      secondaryLabel: props.systemView.daoyuanAvailable >= 6 ? '⚡ 押宝' : undefined,
      tone: 'gold',
      portraitId: rookie.portraitId,
      primaryPayload: {
        type: 'prepare_mission',
        memberId: rookie.id,
        targetType: pickTarget,
        rewardKind: recMethod && props.systemView.daoyuanAvailable >= 8 ? 'method_unlock' : 'cultivation_rounds',
        rewardMethodId: recMethod ?? undefined,
      },
      secondaryPayload:
        props.systemView.daoyuanAvailable >= 6
          ? {
              type: 'issue_now',
              memberId: rookie.id,
              targetType: pickTarget,
              rewardKind: 'cultivation_rounds',
            }
          : undefined,
    });
  }

  // 5. 道统阶梯机会
  if (cards.length < 1 && !props.systemView.unlockedPermissions.includes('standing_bounty')) {
    const fireDisciple = members.find(
      (m) => m.hasAlchemyFire && !m.knownMethods.includes('method_fenhuo_tiqing') && !hasActiveMission(m.id, 'followup_heritage_fenhuo'),
    );
    if (fireDisciple && (props.systemView.inventory.herbs.herb_humai ?? 0) >= 2) {
      cards.push({
        id: 'hook-heritage-fenhuo',
        tag: '道统跃升',
        title: `${fireDisciple.name} · 承传「分火提清」`,
        reason: '首成 +2 根基，解锁自动悬赏',
        actionLabel: '传法',
        tone: 'jade',
        portraitId: fireDisciple.portraitId,
        primaryPayload: {
          type: 'prepare_mission',
          memberId: fireDisciple.id,
          targetType: 'followup_heritage_fenhuo',
          rewardKind: 'cultivation_rounds',
        },
      });
    }
  }

  // 6. 招贤提醒或道统大比
  if (cards.length < 1 && props.systemView.recruitment.remainingSeats > 0) {
    cards.push({
      id: 'hook-recruit-seats',
      tag: '山门纳新',
      title: `待招 ${props.systemView.recruitment.remainingSeats} 名新徒`,
      reason: '试艺择优入宗并秘密绑定',
      actionLabel: '去招徒',
      tone: 'jade',
      primaryPayload: {
        type: 'go_tab',
        tab: 'recruit',
      },
    });
  } else if (
    cards.length < 1 &&
    props.systemView.unlockedPermissions.includes('multi_causal') &&
    (props.systemView.tournaments?.length ?? 0) === 0
  ) {
    cards.push({
      id: 'hook-tournament',
      tag: '多人因果',
      title: '9 根基已满 · 可开宗门大比',
      reason: '一局同下三道互盲私令',
      actionLabel: '去开局',
      tone: 'gold',
      primaryPayload: {
        type: 'go_tab',
        tab: 'heritage',
      },
    });
  }

  return cards.slice(0, 1);
});
</script>

<template>
  <section
    v-if="systemView.pendingEncounter || phenomenon || hookCards.length > 0"
    class="destiny-compass-card"
    data-testid="destiny-hooks-panel"
  >
    <!-- 经典修仙互动天机奇遇（二选一拍板） -->
    <article
      v-if="systemView.pendingEncounter"
      class="encounter-alert-card"
      data-testid="pending-encounter-card"
    >
      <div class="encounter-head">
        <img
          class="encounter-avatar"
          :src="assetUrl(resolvePortraitUrl(systemView.pendingEncounter.portraitId))"
          :alt="systemView.pendingEncounter.actorName"
        />
        <div class="encounter-copy">
          <div class="encounter-badge-row">
            <span class="encounter-tag">📜 天机奇遇 · {{ systemView.pendingEncounter.tag }}</span>
            <span class="encounter-actor">{{ systemView.pendingEncounter.actorName }}</span>
          </div>
          <strong>{{ systemView.pendingEncounter.title }}</strong>
          <p><RichText :text="systemView.pendingEncounter.narrative" theme="dark" /></p>
        </div>
      </div>
      <div class="encounter-choice-grid">
        <button
          type="button"
          class="encounter-choice-btn choice-a"
          data-testid="btn-encounter-a"
          @click="emit('resolveEncounter', systemView.pendingEncounter!.id, 'a')"
        >
          <strong style="color: #8a3b00">{{ systemView.pendingEncounter.choices[0].label }}</strong>
          <span><RichText :text="systemView.pendingEncounter.choices[0].hint" /></span>
        </button>
        <button
          type="button"
          class="encounter-choice-btn choice-b"
          data-testid="btn-encounter-b"
          @click="emit('resolveEncounter', systemView.pendingEncounter!.id, 'b')"
        >
          <strong style="color: #0c5e46">{{ systemView.pendingEncounter.choices[1].label }}</strong>
          <span><RichText :text="systemView.pendingEncounter.choices[1].hint" /></span>
        </button>
      </div>
    </article>

    <div v-if="phenomenon" class="phenom-banner" :class="phenomenon.kind">
      <span class="phenom-icon" aria-hidden="true">{{ phenomenonIcon }}</span>
      <div class="phenom-copy">
        <strong>{{ phenomenon.name }}（余 {{ Math.max(1, phenomenon.expiresAtTick - systemView.tick) }} 刻）</strong>
        <span><RichText :text="phenomenon.buffLabel" theme="dark" /></span>
      </div>
    </div>

    <div v-if="hookCards.length > 0" class="destiny-hook-list">
      <article
        v-for="card in hookCards"
        :key="card.id"
        class="destiny-hook-item clickable"
        :class="card.tone"
        :data-testid="`hook-card-${card.id}`"
        @click="emit('triggerHook', card.primaryPayload)"
      >
        <img
          v-if="card.portraitId"
          class="hook-avatar"
          :src="assetUrl(resolvePortraitUrl(card.portraitId))"
          alt=""
          aria-hidden="true"
        />
        <div class="hook-body">
          <div class="hook-title-row">
            <span class="hook-tag" :class="card.tone">{{ card.tag }}</span>
            <strong><RichText :text="card.title" /></strong>
          </div>
          <p class="hook-reason"><RichText :text="card.reason" /></p>
        </div>
        <div class="hook-actions">
          <button
            type="button"
            class="hook-btn primary"
            @click.stop="emit('triggerHook', card.primaryPayload)"
          >
            {{ card.actionLabel }}
          </button>
          <button
            v-if="card.secondaryLabel && card.secondaryPayload"
            type="button"
            class="hook-btn accent"
            @click.stop="emit('triggerHook', card.secondaryPayload)"
          >
            {{ card.secondaryLabel }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
