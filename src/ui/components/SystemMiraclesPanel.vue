<script setup lang="ts">
import { computed } from 'vue';
import { getNextMajorRealm, isAtRealmPeak } from '../../sim/breakthrough';
import { getCurrentConquestStage, getStrongestActiveMember } from '../../sim/conquest';
import { getDivineWeaponSpecForRealm, MIRACLE_COSTS } from '../../sim/miracles';
import { computeMemberPowerScore } from '../../sim/power';
import type { Member, MiracleId, SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import { resolveOpponentAvatar } from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = defineProps<{
  systemView: SystemView;
  selectedMember: Member;
}>();

const emit = defineEmits<{
  castMiracle: [miracleId: MiracleId, targetMemberId?: string];
  launchConquest: [memberId: string];
}>();

const stage = computed(() => getCurrentConquestStage(props.systemView.conquestStage ?? 0));
const lootChips = computed(() =>
  stage.value.rewardSummary.split(' · ').map((part) => {
    const cls = part.includes('根基')
      ? 'gold'
      : part.includes('道源')
        ? 'jade'
        : part.includes('灵石')
          ? 'amber'
          : 'violet';
    return { text: part, cls };
  }),
);
const strongest = computed(() => getStrongestActiveMember(props.systemView) ?? props.selectedMember);
const strongestPower = computed(() => computeMemberPowerScore(strongest.value));
const selectedPower = computed(() => computeMemberPowerScore(props.selectedMember));

const conquestInFlight = computed(() =>
  props.systemView.missions.some(
    (m) => m.targetType === 'conquer_frontline' && (m.status === 'issued' || m.status === 'accepted'),
  ),
);

const canWinLikely = computed(() => strongestPower.value >= stage.value.opponent.powerScore);
const atPeak = computed(() => isAtRealmPeak(props.selectedMember));
const nextRealm = computed(() => getNextMajorRealm(props.selectedMember.realm));
const divineWeaponSpec = computed(() => getDivineWeaponSpecForRealm(props.selectedMember.realm));
const sectLawUnlocked = computed(() => props.systemView.unlockedPermissions.includes('sect_law'));

const alreadyHasEqualOrBetterWeapon = computed(
  () =>
    Boolean(props.selectedMember.equippedWeapon) &&
    props.selectedMember.equippedWeapon!.attackBonus >= divineWeaponSpec.value.attackBonus,
);
</script>

<template>
  <section class="miracles-stack" data-testid="system-miracles-panel">
    <!-- 1. 诸域争锋 · 踢馆与秘境征伐横幅 -->
    <article class="conquest-banner-card" data-testid="conquest-banner">
      <div class="conquest-head">
        <div class="conquest-boss-row">
          <img
            class="conquest-boss-avatar"
            :src="assetUrl(resolveOpponentAvatar(stage.opponent, stage.stageIndex))"
            :alt="stage.opponent.name"
          />
          <div class="conquest-copy">
            <div class="conquest-badge-row">
              <span class="conquest-stage-badge">{{ stage.badge }}</span>
              <span class="conquest-power-badge" :class="canWinLikely ? 'win' : 'warn'">
                <strong style="color: #79f2be">{{ strongest.name }}</strong>
                <b style="color: #ffe066"> {{ strongestPower }}</b>
                <span style="opacity: 0.7"> vs </span>
                <strong style="color: #ffa8a8">{{ stage.opponent.name }}</strong>
                <b style="color: #ff8787"> {{ stage.opponent.powerScore }}</b>
              </span>
            </div>
            <h3>{{ stage.title }}</h3>
          </div>
        </div>
      </div>

      <div class="conquest-foot">
        <div class="conquest-loot-line">
          <span class="conquest-loot-tag">{{ stage.isRepeatable ? '巡猎' : '首通' }}</span>
          <div class="conquest-loot-chips">
            <span v-for="(chip, cIdx) in lootChips" :key="cIdx" class="loot-chip" :class="chip.cls">
              {{ chip.text }}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="conquest-launch-btn"
          data-testid="btn-conquer-frontline"
          :disabled="conquestInFlight || systemView.daoyuanAvailable < 8"
          @click="emit('launchConquest', strongest.id)"
        >
          {{
            conquestInFlight
              ? '⚔️ 出征激战中'
              : systemView.daoyuanAvailable < 8
                ? '道源不足(需8)'
                : canWinLikely
                  ? `⚔️ 派遣 ${strongest.name} 碾压出征`
                  : `⚔️ 点将 ${strongest.name} 强攻 (8道源)`
          }}
        </button>
      </div>
    </article>

    <!-- 2. 天道神权 · 道源即时开挂台 -->
    <article class="parchment-card miracles-card" data-testid="miracles-card">
      <header class="miracles-head">
        <div>
          <h2 class="card-title">⚡ 天道神权</h2>
          <p class="card-sub">
            <RichText
              :text="`施法：${selectedMember.name}（${selectedMember.realm}${selectedMember.realmLayer}层 · 战力 ${selectedPower}）`"
            />
          </p>
        </div>
        <span class="paper-pill gold">道源 {{ systemView.daoyuanAvailable }}</span>
      </header>

      <div class="miracles-grid">
        <button
          v-if="!atPeak"
          type="button"
          class="miracle-btn gold"
          data-testid="btn-miracle-empower"
          :disabled="systemView.daoyuanAvailable < MIRACLE_COSTS.empower_peak"
          @click="emit('castMiracle', 'empower_peak', selectedMember.id)"
        >
          <span class="miracle-top">
            <strong>⚡ 醍醐灌顶</strong>
            <em>{{ MIRACLE_COSTS.empower_peak }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText :text="`秒冲${selectedMember.realm}圆满并回满`" />
          </span>
        </button>

        <button
          v-else
          type="button"
          class="miracle-btn breakthrough-glow"
          data-testid="btn-miracle-breakthrough"
          :disabled="!nextRealm || systemView.daoyuanAvailable < MIRACLE_COSTS.instant_breakthrough"
          @click="emit('castMiracle', 'instant_breakthrough', selectedMember.id)"
        >
          <span class="miracle-top">
            <strong>🌟 立地破境</strong>
            <em>{{ MIRACLE_COSTS.instant_breakthrough }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText :text="nextRealm ? `必破「${nextRealm}1层」` : '已臻极境'" />
          </span>
        </button>

        <button
          type="button"
          class="miracle-btn jade"
          data-testid="btn-miracle-upgrade-root"
          :disabled="selectedMember.spiritRoot.grade === '天品' || systemView.daoyuanAvailable < MIRACLE_COSTS.upgrade_root"
          @click="emit('castMiracle', 'upgrade_root', selectedMember.id)"
        >
          <span class="miracle-top">
            <strong>🧬 灵根升品</strong>
            <em>{{ MIRACLE_COSTS.upgrade_root }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText
              :text="
                selectedMember.spiritRoot.grade === '凡品'
                  ? '凡品 → 地品灵根'
                  : selectedMember.spiritRoot.grade === '地品'
                    ? '地品 → 天品仙根'
                    : '已臻天品仙根'
              "
            />
          </span>
        </button>

        <button
          type="button"
          class="miracle-btn amethyst"
          data-testid="btn-miracle-bestow-weapon"
          :disabled="alreadyHasEqualOrBetterWeapon || systemView.daoyuanAvailable < MIRACLE_COSTS.bestow_divine_weapon"
          @click="emit('castMiracle', 'bestow_divine_weapon', selectedMember.id)"
        >
          <span class="miracle-top">
            <strong>🗡️ 天道赐器</strong>
            <em>{{ MIRACLE_COSTS.bestow_divine_weapon }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText
              :text="
                alreadyHasEqualOrBetterWeapon
                  ? '已佩同阶神兵'
                  : `赐「${divineWeaponSpec.name}」攻+${divineWeaponSpec.attackBonus}`
              "
            />
          </span>
        </button>

        <button
          type="button"
          class="miracle-btn tide"
          data-testid="btn-miracle-spirit-tide"
          :disabled="systemView.daoyuanAvailable < MIRACLE_COSTS.summon_spirit_tide"
          @click="emit('castMiracle', 'summon_spirit_tide')"
        >
          <span class="miracle-top">
            <strong>🌈 强降仙霖</strong>
            <em>{{ MIRACLE_COSTS.summon_spirit_tide }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText text="全宗清伤 +35 缕 · 12刻灵潮" />
          </span>
        </button>

        <button
          type="button"
          class="miracle-btn imperial"
          :class="{ unlocked: sectLawUnlocked }"
          data-testid="btn-miracle-wanjian"
          :disabled="!sectLawUnlocked || systemView.daoyuanAvailable < MIRACLE_COSTS.sect_law_wanjian"
          @click="emit('castMiracle', 'sect_law_wanjian')"
        >
          <span class="miracle-top">
            <strong>👑 万剑归宗</strong>
            <em>{{ MIRACLE_COSTS.sect_law_wanjian }} 道源</em>
          </span>
          <span class="miracle-desc">
            <RichText
              :text="sectLawUnlocked ? '全宗同沐 25 轮灌顶！' : `需 14 根基解锁（${systemView.foundationPoints}/14）`"
              :theme="sectLawUnlocked ? 'dark' : 'light'"
            />
          </span>
        </button>
      </div>
    </article>
  </section>
</template>
