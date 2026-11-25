<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CONTENT, getItemById, getMethodById } from '../../content/validate';
import { isAtRealmPeak } from '../../sim/breakthrough';
import { getCurrentConquestStage } from '../../sim/conquest';
import { RULE_GRANT_ABILITIES, type RuleAbilityId } from '../../sim/constants';
import { getTraitSpec } from '../../sim/destinyTraits';
import {
  getMissionAvailability,
  GRANTABLE_METHOD_IDS,
  METHOD_GRANT_DAOYUAN_COST,
  pickBestPillInVault,
  pickRecommendedMethodForHost,
} from '../../sim/missions';
import { computeMemberPowerScore, getCultivationPerRound } from '../../sim/power';
import {
  deriveMemberObsession,
  getEffectiveSchemeCost,
  pickBestRivalOrPartner,
  SCHEME_COSTS,
} from '../../sim/schemes';
import type { Member, MissionTargetType, RewardKind, SchemeKind, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolveOpponentAvatar, resolvePortraitUrl, resolveWildBeastsPreview } from '../visuals/assetRegistry';
import { resolveRealmTierClass } from '../visuals/richText';
import RichText from './RichText.vue';

const props = defineProps<{
  systemView: SystemView;
  members: Member[];
  selectedMemberId: string;
  selectedMember: Member;
  advancedOpen: boolean;
  preferredTarget?: MissionTargetType | null;
  preferredRewardKind?: RewardKind | null;
  preferredRewardItemId?: string | null;
  preferredRewardMethodId?: string | null;
  hookToken?: number;
}>();

const emit = defineEmits<{
  selectMember: [memberId: string];
  'update:advancedOpen': [open: boolean];
  executeScheme: [schemeKind: SchemeKind];
  issueMission: [
    payload: {
      recipientId: string;
      targetType: MissionTargetType;
      rewardKind: RewardKind;
      rewardRounds: number;
      abilityId?: RuleAbilityId;
      rewardItemId?: string;
      rewardMethodId?: string;
      includeHiddenReward?: boolean;
    },
  ];
  fastResolve: [ticks: number];
}>();

const AUTO_PRIORITY: readonly MissionTargetType[] = [
  'realm_breakthrough',
  'challenge_gate_duel',
  'followup_heritage_fenhuo',
  'first_alchemy',
  'first_arena_win',
  'followup_alchemy_humai',
  'followup_arena_rematch',
  'craft_forging_sword',
  'craft_forging_core',
  'craft_beast_gather',
  'followup_wild_expedition',
];

const bountyTemplates = CONTENT.missionTemplates.filter((t) => t.isPlayerBounty);
const chosenTarget = ref<MissionTargetType>(props.preferredTarget ?? 'first_alchemy');
const chosenRewardKind = ref<RewardKind>(props.preferredRewardKind ?? 'cultivation_rounds');
const chosenAbilityId = ref<RuleAbilityId>('ability_keep_fire');
const chosenMethodId = ref<string>(
  props.preferredRewardMethodId ?? pickRecommendedMethodForHost(props.selectedMember, chosenTarget.value) ?? 'method_qinglian_huifeng',
);
const chosenPillId = ref<string>(
  props.preferredRewardItemId ?? pickBestPillInVault(props.systemView) ?? 'pill_ningling_1_low',
);
const includeHidden = ref(false);
const showLockedTargets = ref(false);

const obsession = computed(() =>
  deriveMemberObsession(
    { members: props.systemView.members, sectCrisis: props.systemView.sectCrisis, tick: props.systemView.tick },
    props.selectedMember,
  ),
);

const rivalPartner = computed(() =>
  pickBestRivalOrPartner({ members: props.systemView.members }, props.selectedMember),
);

const rivalryCost = computed(() =>
  getEffectiveSchemeCost({ activePerks: props.systemView.activePerks }, 'dual_rivalry'),
);

function schemeCdLeft(kind: SchemeKind): number {
  const until = props.selectedMember.schemeCooldowns?.[kind] ?? 0;
  return Math.max(0, until - props.systemView.tick);
}

function hasReadyScheme(member: Member): boolean {
  if (member.status !== 'active' || !member.binding.bound) return false;
  const cdN = (member.schemeCooldowns?.nurture ?? 0) <= props.systemView.tick;
  const cdT = (member.schemeCooldowns?.tiger_wolf ?? 0) <= props.systemView.tick;
  const cdR = (member.schemeCooldowns?.dual_rivalry ?? 0) <= props.systemView.tick;
  const canR = Boolean(pickBestRivalOrPartner({ members: props.systemView.members }, member));
  return (
    (cdN && props.systemView.daoyuanAvailable >= SCHEME_COSTS.nurture) ||
    (cdT && props.systemView.daoyuanAvailable >= SCHEME_COSTS.tiger_wolf) ||
    (cdR && canR && props.systemView.daoyuanAvailable >= rivalryCost.value)
  );
}

const minSchemeCooldown = computed(() => {
  const cds = [
    schemeCdLeft('nurture'),
    schemeCdLeft('tiger_wolf'),
    rivalPartner.value ? schemeCdLeft('dual_rivalry') : 99,
  ];
  const anyReady = cds.some((c) => c === 0);
  if (anyReady) return 0;
  const positive = cds.filter((c) => c > 0 && c < 99);
  return positive.length > 0 ? Math.min(...positive) : 0;
});

const availabilityByType = computed(() => {
  const map: Record<string, { ok: boolean; reason?: string }> = {};
  for (const tpl of bountyTemplates) {
    map[tpl.id] = getMissionAvailability(props.systemView, props.selectedMember, tpl.id as MissionTargetType);
  }
  return map;
});

const availableTemplates = computed(() =>
  bountyTemplates.filter((t) => availabilityByType.value[t.id]?.ok),
);
const lockedTemplates = computed(() =>
  bountyTemplates.filter((t) => !availabilityByType.value[t.id]?.ok),
);

function pickBestAvailableTarget(member: Member): MissionTargetType {
  for (const tid of AUTO_PRIORITY) {
    const avail = getMissionAvailability(props.systemView, member, tid);
    if (avail.ok) return tid;
  }
  return bountyTemplates[0].id as MissionTargetType;
}

watch(
  () => props.preferredTarget,
  (val) => {
    if (val) chosenTarget.value = val;
  },
);

watch(
  () => props.hookToken,
  () => {
    if (props.preferredTarget) chosenTarget.value = props.preferredTarget;
    if (props.preferredRewardKind) chosenRewardKind.value = props.preferredRewardKind;
    if (props.preferredRewardItemId) chosenPillId.value = props.preferredRewardItemId;
    if (props.preferredRewardMethodId) chosenMethodId.value = props.preferredRewardMethodId;
  },
);

watch(
  () => props.selectedMember.id,
  () => {
    const curAvail = getMissionAvailability(props.systemView, props.selectedMember, chosenTarget.value);
    if (!curAvail.ok) {
      chosenTarget.value = pickBestAvailableTarget(props.selectedMember);
    }
    const recM = pickRecommendedMethodForHost(props.selectedMember, chosenTarget.value);
    if (recM) chosenMethodId.value = recM;
  },
  { immediate: true },
);

const availableVaultPills = computed(() =>
  Object.entries(props.systemView.inventory.pills)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({
      id,
      qty,
      def: getItemById(id),
    }))
    .filter((x) => Boolean(x.def)),
);

const grantableMethods = computed(() =>
  GRANTABLE_METHOD_IDS.filter((mId) => !props.selectedMember.knownMethods.includes(mId))
    .map((mId) => getMethodById(mId))
    .filter((m): m is NonNullable<typeof m> => Boolean(m)),
);

watch(
  () => [props.selectedMember.id, chosenTarget.value, availableVaultPills.value.length],
  () => {
    if (!grantableMethods.value.some((m) => m.id === chosenMethodId.value)) {
      const rec = pickRecommendedMethodForHost(props.selectedMember, chosenTarget.value);
      chosenMethodId.value = rec ?? grantableMethods.value[0]?.id ?? '';
    }
    if (!availableVaultPills.value.some((p) => p.id === chosenPillId.value)) {
      chosenPillId.value = availableVaultPills.value[0]?.id ?? '';
    }
    if (chosenRewardKind.value === 'pill_grant' && availableVaultPills.value.length === 0) {
      chosenRewardKind.value = 'cultivation_rounds';
    }
    if (chosenRewardKind.value === 'method_unlock' && grantableMethods.value.length === 0) {
      chosenRewardKind.value = 'cultivation_rounds';
    }
  },
  { immediate: true },
);

const ruleGrantUnlocked = computed(() =>
  props.systemView.unlockedPermissions.includes('rule_grant'),
);

const selectedTpl = computed(() => bountyTemplates.find((t) => t.id === chosenTarget.value) ?? bountyTemplates[0]);
const perRound = computed(() => getCultivationPerRound(props.selectedMember));
const memberPower = computed(() => computeMemberPowerScore(props.selectedMember));
const isSelectedAtPeak = computed(() => isAtRealmPeak(props.selectedMember));
const currentAvail = computed(() => availabilityByType.value[chosenTarget.value] ?? { ok: false, reason: '不可用' });
const wildBeasts = resolveWildBeastsPreview();

const activeBountiesForHost = computed(() =>
  props.systemView.missions.filter(
    (m) =>
      m.recipientId === props.selectedMember.id &&
      (m.status === 'issued' || m.status === 'accepted') &&
      m.source !== 'auto_daily',
  ),
);

const ticksToResolveHost = computed(() => {
  if (props.selectedMember.currentActivity) {
    return Math.max(1, Math.min(4, props.selectedMember.currentActivity.resolveAtTick - props.systemView.tick));
  }
  return 3;
});

const supportsHidden = computed(
  () =>
    chosenTarget.value === 'first_alchemy' ||
    chosenTarget.value === 'followup_alchemy_humai' ||
    chosenTarget.value === 'craft_forging_sword' ||
    chosenTarget.value === 'craft_forging_core',
);

const selectedAbilityDef = computed(
  () => RULE_GRANT_ABILITIES.find((a) => a.id === chosenAbilityId.value) ?? RULE_GRANT_ABILITIES[0],
);

const talismanQty = computed(() => props.systemView.inventory.talismans.talisman_escape ?? 0);

const gateChallenger = computed(() =>
  props.systemView.activePhenomenon?.kind === 'challenger_at_gate'
    ? props.systemView.activePhenomenon.challenger ?? null
    : null,
);
const conquestBoss = computed(() => getCurrentConquestStage(props.systemView.conquestStage ?? 0).opponent);
</script>

<template>
  <section class="parchment-card issuer-card" data-testid="mission-issuer">
    <header class="card-header">
      <div class="card-title-group">
        <img
          class="card-badge-icon"
          :src="assetUrl('assets/ui/celestial_jade_symbol.webp')"
          alt=""
          aria-hidden="true"
        />
        <div>
          <h2 class="card-title">幕后开挂 · 挑弟子塞外挂</h2>
          <p class="card-sub">旁人一概不知，点卡片立刻涨战力看飙戏</p>
        </div>
      </div>
      <span class="paper-pill gold">可用 {{ systemView.daoyuanAvailable }} 源</span>
    </header>

    <!-- 合并精简门人横条 -->
    <div class="issuer-mini-roster">
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        class="issuer-mini-chip"
        :class="{ selected: selectedMemberId === m.id, departed: m.status === 'departed' }"
        :data-testid="`member-card-${m.id}`"
        @click="emit('selectMember', m.id)"
      >
        <img :src="assetUrl(resolvePortraitUrl(m.portraitId))" :alt="m.name" />
        <span
          v-if="m.status === 'active' && hasReadyScheme(m) && !isAtRealmPeak(m) && m.injuries.length === 0"
          class="chip-ready-dot"
          title="有可施展的幕后开挂牌"
        />
        <div class="mini-chip-text">
          <strong>{{ m.name }}</strong>
          <span>
            <template v-if="m.status === 'departed'">已退宗</template>
            <template v-else-if="m.status === 'dead'">陨落</template>
            <template v-else>
              战 {{ computeMemberPowerScore(m) }}
              <em v-if="isAtRealmPeak(m)" class="chip-peak-badge">⚡可破</em>
              <em v-else-if="m.injuries.length > 0" class="chip-hurt-badge">伤</em>
            </template>
          </span>
        </div>
      </button>
    </div>

    <!-- 一行角色概览 + 命格 + 执念 -->
    <div class="obsession-box" :class="obsession.tone" data-testid="host-obsession-box">
      <div class="issuer-host-summary">
        <strong>{{ selectedMember.name }}</strong>
        <span class="sum-sep">·</span>
        <b :class="resolveRealmTierClass(selectedMember.realm)">{{ selectedMember.realm }}{{ selectedMember.realmLayer }}层</b>
        <span class="sum-sep">·</span>
        <b class="rt-stat-power">战力 {{ memberPower }}</b>
        <span
          v-for="tid in selectedMember.destinyTraits ?? []"
          :key="tid"
          class="trait-mini-chip"
          :title="getTraitSpec(tid).desc"
        >
          {{ getTraitSpec(tid).name }}
        </span>
        <span class="obsession-tag">{{ obsession.tag }}</span>
      </div>
      <p class="obsession-quote">「<RichText :text="obsession.monologue" />」</p>
    </div>

    <!-- 3套幕后老爷爷剧本私令（即点即演三视角迪化） -->
    <div class="scheme-cards-grid" data-testid="scheme-cards-grid">
      <button
        type="button"
        class="scheme-card-btn nurture"
        :class="{ 'peak-ready': isSelectedAtPeak }"
        data-testid="btn-scheme-nurture"
        :disabled="selectedMember.status !== 'active' || schemeCdLeft('nurture') > 0 || systemView.daoyuanAvailable < SCHEME_COSTS.nurture || Boolean(systemView.pendingClutch) || Boolean(systemView.activeDuel)"
        @click="emit('executeScheme', 'nurture')"
      >
        <div class="scheme-top">
          <strong>{{ isSelectedAtPeak ? '⚡ 保送破大境' : '🌱 贴心喂奶' }}</strong>
          <em>{{ SCHEME_COSTS.nurture }} 源</em>
        </div>
        <span>{{ schemeCdLeft('nurture') > 0 ? `消化余 ${schemeCdLeft('nurture')} 刻` : isSelectedAtPeak ? '100% 直破下一大境，战力暴涨' : '清伤满血，圆满直破或稳涨12轮' }}</span>
      </button>

      <button
        type="button"
        class="scheme-card-btn tiger"
        data-testid="btn-scheme-tiger"
        :disabled="selectedMember.status !== 'active' || schemeCdLeft('tiger_wolf') > 0 || systemView.daoyuanAvailable < SCHEME_COSTS.tiger_wolf || Boolean(systemView.pendingClutch) || Boolean(systemView.activeDuel)"
        @click="emit('executeScheme', 'tiger_wolf')"
      >
        <div class="scheme-top">
          <strong>🔥 猛药爆冲</strong>
          <em>{{ SCHEME_COSTS.tiger_wolf }} 源</em>
        </div>
        <span>{{ schemeCdLeft('tiger_wolf') > 0 ? `消化余 ${schemeCdLeft('tiger_wolf')} 刻` : '狂涨18轮+悟招，走火可保驾逆天' }}</span>
      </button>

      <button
        type="button"
        class="scheme-card-btn rivalry"
        data-testid="btn-scheme-rivalry"
        :disabled="selectedMember.status !== 'active' || schemeCdLeft('dual_rivalry') > 0 || !rivalPartner || systemView.daoyuanAvailable < rivalryCost || Boolean(systemView.pendingClutch) || Boolean(systemView.activeDuel)"
        @click="emit('executeScheme', 'dual_rivalry')"
      >
        <div class="scheme-top">
          <strong>🎭 拱火吃瓜</strong>
          <em>{{ rivalryCost }} 源</em>
        </div>
        <span>{{ schemeCdLeft('dual_rivalry') > 0 ? `消化余 ${schemeCdLeft('dual_rivalry')} 刻` : rivalPartner ? `拉「${rivalPartner.name}」互卷！双方+12战力+看飙戏` : '需两名活跃弟子' }}</span>
      </button>
    </div>

    <button
      v-if="selectedMember.status === 'active' && minSchemeCooldown > 0 && activeBountiesForHost.length === 0"
      type="button"
      class="scheme-refresh-strip"
      data-testid="btn-scheme-refresh"
      @click="emit('fastResolve', minSchemeCooldown)"
    >
      <span>⏩ 正在消化余韵（余 {{ minSchemeCooldown }} 刻）</span>
      <strong>点此快进立刻刷新 ▸</strong>
    </button>

    <!-- 若当前宿主正在履约某道私令，就地提供「立即揭晓」快捷条 -->
    <div v-if="activeBountiesForHost.length > 0" class="active-bounty-strip" data-testid="active-bounty-strip">
      <div class="active-bounty-info">
        <span class="paper-pill gold">履约中 · {{ activeBountiesForHost[0].title }}</span>
        <span class="active-bounty-reward">奖：{{ activeBountiesForHost[0].primaryReward.label }}</span>
      </div>
      <button
        type="button"
        class="fast-resolve-btn"
        data-testid="btn-fast-resolve"
        @click="emit('fastResolve', ticksToResolveHost)"
      >
        ⚡ 催动天机 (+{{ ticksToResolveHost }} 刻)
      </button>
    </div>

    <!-- 默认折叠的进阶委派抽屉 -->
    <button
      type="button"
      class="drawer-accordion-btn subtle"
      data-testid="toggle-advanced-bounty"
      @click="emit('update:advancedOpen', !advancedOpen)"
    >
      <span>⚙️ 进阶委派：指定炼丹 / 试剑 / 传承（{{ availableTemplates.length }}项可用 · 休闲可不点）</span>
      <span>{{ advancedOpen ? '收起 ▴' : '展开 ▾' }}</span>
    </button>

    <div v-if="advancedOpen" class="advanced-bounty-box">
    <div class="target-chip-grid">
      <button
        v-for="tpl in availableTemplates"
        :key="tpl.id"
        type="button"
        class="target-chip"
        :class="{ active: chosenTarget === tpl.id }"
        :data-testid="`select-target-${tpl.id}`"
        @click="chosenTarget = tpl.id as MissionTargetType"
      >
        <span>{{ tpl.title }}</span>
      </button>
    </div>

    <div v-if="lockedTemplates.length > 0" class="locked-targets-block">
      <button
        type="button"
        class="locked-targets-toggle"
        @click="showLockedTargets = !showLockedTargets"
      >
        <span>暂未满足前置（{{ lockedTemplates.length }} 项）</span>
        <span>{{ showLockedTargets ? '收起' : '展开' }}</span>
      </button>
      <div v-show="showLockedTargets" class="target-chip-grid locked-compact">
        <button
          v-for="tpl in lockedTemplates"
          :key="tpl.id"
          type="button"
          class="target-chip unavailable"
          :class="{ active: chosenTarget === tpl.id }"
          :data-testid="`select-target-${tpl.id}`"
          @click="chosenTarget = tpl.id as MissionTargetType"
        >
          <span>{{ tpl.title }}</span>
        </button>
      </div>
    </div>

    <div class="issuer-detail-box" v-if="selectedTpl">
      <div class="reward-cards-block">
        <div class="reward-cards-grid compact">
          <button
            type="button"
            class="reward-card-btn tone-gold"
            :class="{ active: chosenRewardKind === 'cultivation_rounds' }"
            data-testid="reward-opt-cultivation_rounds"
            @click="chosenRewardKind = 'cultivation_rounds'"
          >
            <strong>⚡ {{ selectedTpl.defaultRounds }} 轮灌顶</strong>
            <span><RichText :text="`+${perRound * selectedTpl.defaultRounds} 缕 · ${selectedTpl.defaultDaoyuanCost} 源`" :theme="chosenRewardKind === 'cultivation_rounds' ? 'dark' : 'light'" /></span>
          </button>

          <button
            type="button"
            class="reward-card-btn tone-sapphire"
            :class="{ active: chosenRewardKind === 'method_unlock' }"
            :disabled="grantableMethods.length === 0"
            data-testid="reward-opt-method_unlock"
            @click="chosenRewardKind = 'method_unlock'"
          >
            <strong>📜 秘传玄功</strong>
            <span><RichText :text="grantableMethods.length > 0 ? `${METHOD_GRANT_DAOYUAN_COST} 源` : '已通'" :theme="chosenRewardKind === 'method_unlock' ? 'dark' : 'light'" /></span>
          </button>

          <button
            type="button"
            class="reward-card-btn tone-amber"
            :class="{ active: chosenRewardKind === 'pill_grant' }"
            :disabled="availableVaultPills.length === 0"
            data-testid="reward-opt-pill_grant"
            @click="chosenRewardKind = 'pill_grant'"
          >
            <strong>💊 库藏灵丹</strong>
            <span><RichText :text="availableVaultPills.length > 0 ? '0 源' : '无丹'" :theme="chosenRewardKind === 'pill_grant' ? 'dark' : 'light'" /></span>
          </button>

          <button
            type="button"
            class="reward-card-btn tone-jade"
            :class="{ active: chosenRewardKind === 'talisman_escape' }"
            :disabled="talismanQty <= 0"
            data-testid="reward-opt-talisman_escape"
            @click="chosenRewardKind = 'talisman_escape'"
          >
            <strong>🧿 遁符({{ talismanQty }})</strong>
            <span><RichText text="0 源" :theme="chosenRewardKind === 'talisman_escape' ? 'dark' : 'light'" /></span>
          </button>

          <button
            type="button"
            class="reward-card-btn tone-violet"
            :class="{ active: chosenRewardKind === 'rule_ability' }"
            :disabled="!ruleGrantUnlocked"
            data-testid="reward-opt-rule_ability"
            @click="chosenRewardKind = 'rule_ability'"
          >
            <strong>✨ 规则神通</strong>
            <span><RichText :text="ruleGrantUnlocked ? '10~12 源' : '需 5 根基'" :theme="chosenRewardKind === 'rule_ability' ? 'dark' : 'light'" /></span>
          </button>
        </div>

        <div v-if="chosenRewardKind === 'method_unlock' && grantableMethods.length > 0" class="sub-reward-picker">
          <div class="sub-picker-chips">
            <button
              v-for="m in grantableMethods"
              :key="m.id"
              type="button"
              class="sub-chip-btn"
              :class="{ active: chosenMethodId === m.id }"
              @click="chosenMethodId = m.id"
            >
              《{{ m.name }}》· {{ m.tier }}（练速 {{ m.cultivationRate }}/轮 · 战力 +{{ m.powerBonus }}）
            </button>
          </div>
        </div>

        <div v-if="chosenRewardKind === 'pill_grant' && availableVaultPills.length > 0" class="sub-reward-picker">
          <div class="sub-picker-chips">
            <button
              v-for="p in availableVaultPills"
              :key="p.id"
              type="button"
              class="sub-chip-btn"
              :class="{ active: chosenPillId === p.id }"
              @click="chosenPillId = p.id"
            >
              {{ p.def!.name }}（余{{ p.qty }}）
            </button>
          </div>
        </div>

        <div v-if="chosenRewardKind === 'rule_ability' && ruleGrantUnlocked" class="sub-reward-picker">
          <div class="sub-picker-chips">
            <button
              v-for="ab in RULE_GRANT_ABILITIES"
              :key="ab.id"
              type="button"
              class="sub-chip-btn"
              :class="{ active: chosenAbilityId === ab.id }"
              @click="chosenAbilityId = ab.id"
            >
              {{ ab.name }}（{{ ab.daoyuanCost }} 道源）
            </button>
          </div>
          <div class="sub-picker-desc">{{ selectedAbilityDef.description }}</div>
        </div>
      </div>

      <div class="issuer-action-row">
        <label v-if="supportsHidden" class="hidden-reward-toggle" style="flex: 1">
          <input v-model="includeHidden" type="checkbox" data-testid="chk-hidden-reward" />
          <span>预封隐藏机缘：同门受惠加奖 6 轮修为（加留 4 源 · 未中退还）</span>
        </label>

        <button
          type="button"
          class="cta-nephrite-btn"
          :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
          data-testid="btn-issue-mission"
          :disabled="!currentAvail.ok"
          @click="
            emit('issueMission', {
              recipientId: selectedMember.id,
              targetType: chosenTarget,
              rewardKind: chosenRewardKind,
              rewardRounds: selectedTpl.defaultRounds,
              abilityId: chosenRewardKind === 'rule_ability' ? chosenAbilityId : undefined,
              rewardItemId: chosenRewardKind === 'pill_grant' ? chosenPillId : undefined,
              rewardMethodId: chosenRewardKind === 'method_unlock' ? chosenMethodId : undefined,
              includeHiddenReward: supportsHidden ? includeHidden : false,
            })
          "
        >
          发布私令
        </button>
      </div>

      <div v-if="!currentAvail.ok" class="warn-hint">
        当前限制：{{ currentAvail.reason }}
      </div>

      <div
        v-if="chosenTarget.includes('arena') || chosenTarget.includes('expedition') || chosenTarget === 'challenge_gate_duel' || chosenTarget === 'conquer_frontline'"
        class="opponents-preview-box"
        data-testid="opponents-preview"
      >
        <div class="field-caption" style="margin-bottom: 6px">可交锋对手与山外妖兽情报：</div>
        <div class="opponent-mini-grid">
          <div v-if="chosenTarget === 'conquer_frontline'" class="opponent-mini-card beast">
            <img :src="assetUrl(resolveOpponentAvatar(conquestBoss, 0))" :alt="conquestBoss.name" />
            <div>
              <div class="opp-name">
                <b class="rt-name">{{ conquestBoss.name }}</b> · <b :class="resolveRealmTierClass(conquestBoss.realm)">{{ conquestBoss.realm }}{{ conquestBoss.realmLayer }}层</b>
              </div>
              <div class="opp-meta">{{ conquestBoss.title }} · <b class="rt-stat-power">战力 {{ conquestBoss.powerScore }}</b></div>
            </div>
          </div>
          <div v-if="chosenTarget === 'challenge_gate_duel' && gateChallenger" class="opponent-mini-card beast">
            <img :src="assetUrl(resolveOpponentAvatar(gateChallenger, 0))" :alt="gateChallenger.name" />
            <div>
              <div class="opp-name">
                <b class="rt-name">{{ gateChallenger.name }}</b> · <b :class="resolveRealmTierClass(gateChallenger.realm)">{{ gateChallenger.realm }}{{ gateChallenger.realmLayer }}层</b>
              </div>
              <div class="opp-meta">{{ gateChallenger.title }} · <b class="rt-stat-power">战力 {{ gateChallenger.powerScore }}</b></div>
            </div>
          </div>
          <div v-for="(opp, idx) in systemView.arenaOpponents" :key="opp.id" class="opponent-mini-card">
            <img :src="assetUrl(resolveOpponentAvatar(opp, idx))" :alt="opp.name" />
            <div>
              <div class="opp-name">
                <b class="rt-name">{{ opp.name }}</b> · <b :class="resolveRealmTierClass(opp.realm)">{{ opp.realm }}{{ opp.realmLayer }}层</b>
              </div>
              <div class="opp-meta">{{ opp.title }} · <b class="rt-stat-power">战力 {{ opp.powerScore }}</b></div>
            </div>
          </div>
          <div
            v-for="beast in wildBeasts.slice(0, chosenTarget.includes('expedition') ? 3 : 1)"
            :key="beast.id"
            class="opponent-mini-card beast"
          >
            <img :src="assetUrl(beast.circleUrl)" :alt="beast.name" />
            <div>
              <div class="opp-name"><b class="rt-name">{{ beast.name }}</b></div>
              <div class="opp-meta"><RichText :text="`${beast.realmLabel} · 战力 108`" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </section>
</template>
