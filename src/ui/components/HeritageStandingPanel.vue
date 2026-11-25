<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import {
  RULE_GRANT_ABILITIES,
  SYSTEM_PERMISSION_TIERS,
  type RuleAbilityId,
} from '../../sim/constants';
import type { SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import RichText from './RichText.vue';

const props = defineProps<{
  systemView: SystemView;
}>();

const emit = defineEmits<{
  createStanding: [payload: { title: string; triggerCondition: 'new_disciple_first_alchemy' | 'new_disciple_first_arena_win'; rewardKind: 'cultivation_rounds' | 'talisman_escape' }];
  toggleStanding: [ruleId: string, enabled: boolean];
  grantAbility: [payload: { recipientId: string; abilityId: RuleAbilityId }];
  launchTournament: [payload: { breakthroughHostId: string; championHostId: string; guardianElderId: string }];
  castWanjian: [];
}>();

const standingUnlocked = computed(() =>
  props.systemView.unlockedPermissions.includes('standing_bounty'),
);
const ruleGrantUnlocked = computed(() =>
  props.systemView.unlockedPermissions.includes('rule_grant'),
);
const multiCausalUnlocked = computed(() =>
  props.systemView.unlockedPermissions.includes('multi_causal'),
);
const sectLawUnlocked = computed(() =>
  props.systemView.unlockedPermissions.includes('sect_law'),
);

const newTitle = ref('新入门者首次赢下同境擂');
const newTrigger = ref<'new_disciple_first_alchemy' | 'new_disciple_first_arena_win'>(
  'new_disciple_first_arena_win',
);
const newReward = ref<'cultivation_rounds' | 'talisman_escape'>('talisman_escape');

const activeMembers = computed(() =>
  props.systemView.members.filter((m) => m.status === 'active' && m.binding.bound),
);

const grantRecipientId = ref('');
const grantAbilityId = ref<RuleAbilityId>('ability_keep_fire');

const selectedGrantHost = computed(
  () => activeMembers.value.find((m) => m.id === grantRecipientId.value) ?? null,
);
const selectedAbilityOwned = computed(() =>
  Boolean(selectedGrantHost.value?.grantedAbilities?.includes(grantAbilityId.value)),
);

function abilityNameById(id: string): string {
  return RULE_GRANT_ABILITIES.find((a) => a.id === id)?.name ?? id;
}

const tournAId = ref('');
const tournBId = ref('');
const tournElderId = ref('');

watchEffect(() => {
  const list = activeMembers.value;
  if (list.length === 0) return;
  if (!list.some((m) => m.id === grantRecipientId.value)) {
    grantRecipientId.value = list[list.length - 1].id;
  }
  const disciples = list.filter((m) => m.role === 'disciple');
  const elderOrMaster = list.find((m) => m.role === 'elder') ?? list[0];
  if (!list.some((m) => m.id === tournElderId.value)) {
    tournElderId.value = elderOrMaster.id;
  }
  if (!list.some((m) => m.id === tournAId.value)) {
    tournAId.value = (disciples[0] ?? list[0]).id;
  }
  if (!list.some((m) => m.id === tournBId.value)) {
    const second = disciples.find((d) => d.id !== tournAId.value) ?? list.find((m) => m.id !== tournAId.value && m.id !== tournElderId.value) ?? list[0];
    tournBId.value = second.id;
  }
});

function handleTriggerChange() {
  if (newTrigger.value === 'new_disciple_first_arena_win') {
    newTitle.value = '新入门者首次赢下同境擂';
    newReward.value = 'talisman_escape';
  } else {
    newTitle.value = '新入门者首次独立成丹';
    newReward.value = 'cultivation_rounds';
  }
}

function getMemberName(id: string): string {
  return props.systemView.members.find((m) => m.id === id)?.name ?? id;
}

function missionStatusText(id: string): string {
  const ms = props.systemView.missions.find((m) => m.id === id);
  if (!ms) return '待查';
  if (ms.status === 'completed') return '✓ 已兑现';
  if (ms.status === 'failed' || ms.status === 'expired') return '未成已退还';
  return '进行中';
}
</script>

<template>
  <div class="drawer-stack" data-testid="heritage-standing-panel">
    <section class="parchment-card">
      <header class="card-header">
        <div class="card-title-group">
          <img
            class="card-badge-icon"
            :src="assetUrl('assets/ui/shared_breakthrough_symbol.webp')"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 class="card-title">系统权限阶梯与道统根基</h2>
            <p class="card-sub">传法后再由第二人独立复现，方涨根基</p>
          </div>
        </div>
        <span class="paper-pill gold" data-testid="foundation-points-label">
          当前根基 {{ systemView.foundationPoints }} 点
        </span>
      </header>

      <div class="tier-ladder">
        <div
          v-for="tier in SYSTEM_PERMISSION_TIERS"
          :key="tier.key"
          class="tier-node"
          :class="{ unlocked: systemView.unlockedPermissions.includes(tier.key) }"
          :data-testid="`perm-tier-${tier.key}`"
        >
          <strong>{{ tier.name }}</strong>
          <span>{{ tier.foundationRequired }} 点 · {{ systemView.unlockedPermissions.includes(tier.key) ? '✓ 已解锁' : '未解锁' }}</span>
        </div>
      </div>

      <p class="empty-note" style="margin-top: 8px">
        进阶双路径：① 宗门传承二传（分火 +2 / 器道 +3 / 御兽 +4，共 9 点）；② 诸域征伐踢馆（5 重强敌首通共 +17 根基）。满 14 点即可解锁终极「宗门法则 · 万剑归宗」！
      </p>
    </section>

    <!-- 竹简卷轴质感传承记录卡 -->
    <section class="bamboo-scroll-box">
      <img
        class="bamboo-scroll-bg"
        :src="assetUrl('assets/ui/shared_bamboo_panel.webp')"
        alt=""
        aria-hidden="true"
      />
      <div class="bamboo-scroll-inner">
        <div class="bamboo-header">
          <h3>道统首成玉牒名录</h3>
          <span class="bamboo-count">{{ systemView.heritages.length }} 项入谱</span>
        </div>
        <div v-if="systemView.heritages.length === 0" class="bamboo-empty">
          尚无二传首成记录。可在「门人·密令」页给弟子派发「承传分火提清」「锻铸蓄水剑」或「携兽探泉采露」。
        </div>
        <div v-else class="bamboo-list">
          <div
            v-for="h in systemView.heritages"
            :key="h.key"
            class="bamboo-entry"
            data-testid="heritage-record-item"
          >
            <div class="bamboo-entry-top">
              <strong><RichText :text="`传承「${h.methodName}」`" theme="dark" /></strong>
              <span><RichText :text="`+${h.foundationAwarded} 根基 · +${h.daoyuanAwarded} 道源`" theme="dark" /></span>
            </div>
            <div class="bamboo-entry-sub">
              <RichText :text="`传法者 ${getMemberName(h.founderId)} → 独立复现 ${getMemberName(h.successorId)}（第 ${h.achievedAtTick} 刻）`" theme="dark" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 规则赐予台（5 点根基解锁） -->
    <section class="parchment-card" data-testid="rule-grant-panel">
      <header class="card-header">
        <div class="card-title-group">
          <img
            class="card-badge-icon"
            :src="assetUrl('assets/ui/celestial_jade_symbol.webp')"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 class="card-title">规则赐予 · 永久神通赏格</h2>
            <p class="card-sub">耗道源将改变玩法的永久能力直接融于宿主</p>
          </div>
        </div>
        <span class="paper-pill" :class="ruleGrantUnlocked ? 'gold' : ''">
          {{ ruleGrantUnlocked ? '已解锁可用' : '需 5 点根基' }}
        </span>
      </header>

      <div v-if="ruleGrantUnlocked" class="standing-form">
        <select v-model="grantRecipientId" class="paper-select" data-testid="select-grant-host" aria-label="选择赐福宿主">
          <option v-for="m in activeMembers" :key="m.id" :value="m.id">
            {{ m.name }}（{{ m.realm }}{{ m.realmLayer }}层{{ (m.grantedAbilities?.length ?? 0) > 0 ? ` · 已掌${m.grantedAbilities!.length}项神通` : '' }}）
          </option>
        </select>
        <div v-if="selectedGrantHost && (selectedGrantHost.grantedAbilities?.length ?? 0) > 0" class="host-tags-strip">
          <span
            v-for="ab in selectedGrantHost.grantedAbilities"
            :key="ab"
            class="micro-badge gold"
          >
            ✓ 已掌·{{ abilityNameById(ab) }}
          </span>
        </div>
        <select v-model="grantAbilityId" class="paper-select" data-testid="select-grant-ability" aria-label="选择永久神通">
          <option v-for="ab in RULE_GRANT_ABILITIES" :key="ab.id" :value="ab.id">
            {{ ab.name }}（{{ ab.daoyuanCost }} 道源）{{ selectedGrantHost?.grantedAbilities?.includes(ab.id) ? '【已掌】' : '' }}
          </option>
        </select>
        <div class="sub-picker-desc">
          {{ RULE_GRANT_ABILITIES.find((a) => a.id === grantAbilityId)?.description }}
        </div>
        <button
          type="button"
          class="cta-nephrite-btn"
          :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
          data-testid="btn-grant-ability"
          :disabled="selectedAbilityOwned"
          @click="emit('grantAbility', { recipientId: grantRecipientId, abilityId: grantAbilityId })"
        >
          {{ selectedAbilityOwned ? '该宿主已掌握此神通' : '赐予永久神通' }}
        </button>
      </div>
      <div v-else class="empty-note">
        取得 5 点道统根基后解锁「规则赐予」：可赐「留一息火」「绝境爆发」「灵犀血脉觉醒」。
      </div>
    </section>

    <!-- 多人因果大比布局台（9 点根基解锁） -->
    <section class="parchment-card" data-testid="multi-causal-panel">
      <header class="card-header">
        <div class="card-title-group">
          <img
            class="card-badge-icon"
            :src="assetUrl('assets/ui/shared_bagua_symbol.webp')"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 class="card-title">多人因果 · 宗门大比三令同局</h2>
            <p class="card-sub">分别向甲破关、乙夺魁、长老护擂下密令，各自结算</p>
          </div>
        </div>
        <span class="paper-pill" :class="multiCausalUnlocked ? 'gold' : ''">
          {{ multiCausalUnlocked ? '已解锁可用' : '需 9 点根基' }}
        </span>
      </header>

      <div v-if="multiCausalUnlocked" class="standing-form">
        <select v-model="tournAId" class="paper-select" data-testid="select-tourn-a" aria-label="大比密令甲：阵前破关">
          <option v-for="m in activeMembers" :key="m.id" :value="m.id">
            甲·阵前破关：{{ m.name }}（{{ m.realm }}{{ m.realmLayer }}）
          </option>
        </select>
        <select v-model="tournBId" class="paper-select" data-testid="select-tourn-b" aria-label="大比密令乙：擂上夺魁">
          <option v-for="m in activeMembers" :key="m.id" :value="m.id">
            乙·擂上夺魁：{{ m.name }}（{{ m.realm }}{{ m.realmLayer }}）
          </option>
        </select>
        <select v-model="tournElderId" class="paper-select" data-testid="select-tourn-elder" aria-label="大比密令丙：护我门人">
          <option v-for="m in activeMembers" :key="m.id" :value="m.id">
            丙·护台长老：{{ m.name }}（{{ m.realm }}{{ m.realmLayer }}）
          </option>
        </select>
        <button
          type="button"
          class="cta-nephrite-btn"
          :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
          data-testid="btn-launch-tournament"
          @click="
            emit('launchTournament', {
              breakthroughHostId: tournAId,
              championHostId: tournBId,
              guardianElderId: tournElderId,
            })
          "
        >
          密发大比三令（22 道源）
        </button>
      </div>
      <div v-else class="empty-note">
        取得 9 点道统根基后解锁「多人因果」：可对同一届大比三人分别布置互斥或协作的私密悬赏。
      </div>

      <div v-if="systemView.tournaments.length > 0" class="records-list" style="margin-top: 8px">
        <div
          v-for="t in [...systemView.tournaments].reverse()"
          :key="t.id"
          class="record-row"
          :data-testid="`tournament-card-${t.id}`"
        >
          <div class="record-top">
            <strong>宗门论剑大比 · {{ t.phase === 'settled' ? '已落幕' : t.phase === 'dueling' ? '决赛在即' : '闭关备战中' }}</strong>
            <span class="paper-pill" :class="t.phase === 'settled' ? 'gold' : ''">第 {{ t.duelResolveTick }} 刻决出</span>
          </div>
          <div class="record-sub">
            <RichText
              :text="`甲（${getMemberName(t.breakthroughHostId)} · 破关）：${missionStatusText(t.breakthroughMissionId)} ｜ 乙（${getMemberName(t.championHostId)} · 夺魁）：${missionStatusText(t.championMissionId)} ｜ 丙（${getMemberName(t.guardianElderId)} · 护擂）：${missionStatusText(t.guardMissionId)}`"
            />
          </div>
          <div v-if="t.summary" class="record-body"><RichText :text="t.summary" /></div>
        </div>
      </div>
    </section>

    <!-- 宗门法则（14 点根基解锁） -->
    <section class="parchment-card" data-testid="sect-law-panel">
      <header class="card-header">
        <div class="card-title-group">
          <img
            class="card-badge-icon"
            :src="assetUrl('assets/ui/shared_gold_formation_symbol.webp')"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 class="card-title">宗门法则 · 万剑归宗</h2>
            <p class="card-sub">耗 30 道源引护山金莲灌顶，全宗同沐 25 轮大道修为</p>
          </div>
        </div>
        <span class="paper-pill" :class="sectLawUnlocked ? 'gold' : ''">
          {{ sectLawUnlocked ? '已解锁可用' : `需 14 点根基 (${systemView.foundationPoints}/14)` }}
        </span>
      </header>
      <div v-if="sectLawUnlocked" class="standing-form">
        <button
          type="button"
          class="cta-nephrite-btn"
          :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
          data-testid="btn-launch-wanjian"
          :disabled="systemView.daoyuanAvailable < 30"
          @click="emit('castWanjian')"
        >
          {{ systemView.daoyuanAvailable < 30 ? '道源不足（需 30 点）' : '👑 催动万剑归宗·全宗灌顶（30 道源）' }}
        </button>
      </div>
      <div v-else class="empty-note">
        达成 14 点道统根基（完成传承并征伐诸域踢馆即可）即可解锁全宗飞升终极大法「万剑归宗」。
      </div>
    </section>

    <section class="parchment-card">
      <header class="card-header">
        <div class="card-title-group">
          <img
            class="card-badge-icon"
            :src="assetUrl('assets/ui/shared_gold_formation_symbol.webp')"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 class="card-title">常开悬赏法则（自动悬赏）</h2>
            <p class="card-sub">新入门弟子满足条件时由系统自动签发私令</p>
          </div>
        </div>
        <span class="paper-pill" :class="standingUnlocked ? 'gold' : ''">
          {{ standingUnlocked ? '已解锁可用' : '需 2 点根基' }}
        </span>
      </header>

      <div v-if="standingUnlocked" class="standing-form">
        <input v-model="newTitle" class="paper-select" aria-label="常开悬赏标题" />
        <select v-model="newTrigger" class="paper-select" @change="handleTriggerChange" aria-label="触发条件">
          <option value="new_disciple_first_arena_win">新人首次赢下同境擂</option>
          <option value="new_disciple_first_alchemy">新人首次独立成丹</option>
        </select>
        <select v-model="newReward" class="paper-select" aria-label="常开赏品">
          <option value="talisman_escape">赏：凡阶遁符 × 1</option>
          <option value="cultivation_rounds">赏：十轮修为灌注（6 道源）</option>
        </select>
        <button
          type="button"
          class="cta-nephrite-btn"
          :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
          data-testid="btn-create-standing"
          @click="
            emit('createStanding', {
              title: newTitle,
              triggerCondition: newTrigger,
              rewardKind: newReward,
            })
          "
        >
          立下常开悬赏
        </button>
      </div>

      <div v-if="systemView.standingBounties.length === 0" class="empty-note">
        尚未立下常开自动悬赏规则。
      </div>
      <div v-else class="records-list" style="margin-top: 8px">
        <div
          v-for="rule in systemView.standingBounties"
          :key="rule.id"
          class="record-row"
          :data-testid="`standing-rule-${rule.id}`"
        >
          <div class="record-top">
            <div>
              <strong>{{ rule.title }}</strong>
              <div class="record-sub">
                赏：{{ rule.rewardKind === 'talisman_escape' ? '凡阶遁符×1' : '十轮修为' }} · 已触发 {{ rule.triggeredMemberIds.length }} 人
              </div>
            </div>
            <button
              type="button"
              class="paper-btn"
              :class="{ active: rule.enabled }"
              @click="emit('toggleStanding', rule.id, !rule.enabled)"
            >
              {{ rule.enabled ? '生效中 · 点击暂停' : '已暂停 · 点击启用' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
