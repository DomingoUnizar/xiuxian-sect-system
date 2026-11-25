<script setup lang="ts">
import { computed, ref } from 'vue';
import { CONTENT } from '../../content/validate';
import { getTraitSpec } from '../../sim/destinyTraits';
import type { Candidate, RecruitmentSession, SectFocus } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import {
  REGION_SCENE_MAP,
  resolveAvatarFrameUrl,
  resolvePortraitUrl,
} from '../visuals/assetRegistry';
import RichText from './RichText.vue';

const props = defineProps<{
  recruitment: RecruitmentSession;
  sectFocus: SectFocus;
}>();

const emit = defineEmits<{
  openSession: [regionId: string];
  audition: [candidateId: string];
  invite: [candidateId: string, seatTier: 'outer' | 'alchemy_hall' | 'sword_pavilion'];
  autoFill: [];
}>();

const selectedRegionId = ref(props.recruitment.regionId || CONTENT.regions[0].id);
const seatChoices = ref<Record<string, 'outer' | 'alchemy_hall' | 'sword_pavilion'>>({});

const activeRegionMeta = computed(() => {
  const reg = CONTENT.regions.find((r) => r.id === selectedRegionId.value) ?? CONTENT.regions[0];
  const vis = REGION_SCENE_MAP[reg.id] ?? REGION_SCENE_MAP.zhongzhou;
  return { ...reg, ...vis };
});

function getSeatChoice(cand: Candidate): 'outer' | 'alchemy_hall' | 'sword_pavilion' {
  return seatChoices.value[cand.id] ?? cand.requirement.minSeatTier;
}

function setSeatChoice(candidateId: string, val: 'outer' | 'alchemy_hall' | 'sword_pavilion') {
  seatChoices.value[candidateId] = val;
}
</script>

<template>
  <div class="drawer-stack" data-testid="recruitment-panel">
    <!-- 招贤地域玄幻意境卡片 -->
    <section class="parchment-card mood-header-card">
      <img
        class="mood-banner-img"
        :src="assetUrl(activeRegionMeta.scenePath)"
        :alt="activeRegionMeta.name"
      />
      <div class="mood-overlay">
        <div>
          <h2>开山招贤 · 第 {{ recruitment.generation }} 届</h2>
          <p>{{ activeRegionMeta.badge }} · {{ activeRegionMeta.description }}</p>
        </div>
        <span class="paper-pill gold" data-testid="remaining-seats">
          余 {{ recruitment.remainingSeats }} / {{ recruitment.totalSeats }} 席
        </span>
      </div>
    </section>

    <section class="parchment-card">
      <div class="recruit-toolbar">
        <select v-model="selectedRegionId" class="paper-select" aria-label="选择招贤地域">
          <option v-for="r in CONTENT.regions" :key="r.id" :value="r.id">
            {{ r.name }}
          </option>
        </select>
        <button
          type="button"
          class="paper-btn"
          data-testid="btn-open-session"
          @click="emit('openSession', selectedRegionId)"
        >
          前往该域开新届
        </button>
        <button
          type="button"
          class="paper-btn active"
          style="min-height: 40px"
          data-testid="btn-auto-fill"
          :disabled="recruitment.remainingSeats <= 0"
          @click="emit('autoFill')"
        >
          ⚡ 一键招满空席
        </button>
      </div>
    </section>

    <div class="candidate-list">
      <article
        v-for="cand in recruitment.candidates"
        :key="cand.id"
        class="parchment-card candidate-card"
        :data-testid="`candidate-card-${cand.id}`"
      >
        <div class="cand-top">
          <div class="cand-visual-pair">
            <div class="framed-avatar-box">
              <img class="avatar-face" :src="assetUrl(resolvePortraitUrl(cand.portraitId))" :alt="cand.name" />
              <img class="avatar-rim" :src="assetUrl(resolveAvatarFrameUrl({ spiritRoot: cand.spiritRoot }))" alt="" aria-hidden="true" />
            </div>
          </div>

          <div class="cand-info">
            <div class="cand-name-row">
              <strong class="rt-name">{{ cand.name }}</strong>
              <span
                class="paper-pill"
                :class="cand.outcome === 'accepted' ? 'gold' : cand.outcome === 'declined' ? 'warn' : ''"
              >
                {{
                  cand.outcome === 'accepted'
                    ? '已拜入绑定'
                    : cand.outcome === 'declined'
                      ? '已谢绝'
                      : cand.auditioned
                        ? '已试艺'
                        : '待验看'
                }}
              </span>
            </div>
            <div class="cand-meta"><RichText :text="`${cand.realm}${cand.realmLayer}层 · 诉求：${cand.requirement.label}`" /></div>
            <div v-if="cand.destinyTraits && cand.destinyTraits.length > 0" class="trait-badges-row">
              <span
                v-for="tid in cand.destinyTraits"
                :key="tid"
                class="destiny-trait-pill"
                :class="getTraitSpec(tid).rarity"
                :title="getTraitSpec(tid).desc"
              >
                ✨ {{ getTraitSpec(tid).name }} · {{ getTraitSpec(tid).tag }}
              </span>
            </div>
            <p class="cand-bg"><RichText :text="cand.background" /></p>
          </div>
        </div>

        <div v-if="cand.auditioned" class="host-tags-strip" data-testid="audition-revealed">
          <span class="micro-badge gold">{{ cand.spiritRoot.grade }}{{ cand.spiritRoot.elements.join('') }}灵根</span>
          <span class="micro-badge">{{ cand.personality }}</span>
          <span class="micro-badge warm" v-if="cand.hasAlchemyFire">会运丹火（{{ cand.craftRank.alchemy }}品）</span>
          <span class="micro-badge jade" v-if="cand.hasSwordStance">已熟青松剑势</span>
          <span class="micro-badge"><RichText :text="`悟性 ${cand.aptitude.comprehension} · 根骨 ${cand.aptitude.bone}`" /></span>
        </div>
        <div v-else class="empty-note">尚未试艺，暂不明细具体灵根与先天手段。</div>

        <div v-if="cand.auditioned && cand.auditionLine" class="cand-bg">
          <RichText :text="`试艺现场：「${cand.auditionLine}」`" />
        </div>

        <div v-if="cand.outcome === 'accepted' && cand.acceptLine" class="decision-note">
          <RichText :text="`入门感言：「${cand.acceptLine}」`" />
        </div>
        <div v-else-if="cand.outcome === 'declined' && cand.declineLine" class="decision-note">
          <RichText :text="`辞谢言辞：「${cand.declineLine}」`" />
        </div>
        <div v-if="cand.decisionReason" class="decision-note">
          <RichText :text="cand.decisionReason" />
        </div>

        <div v-if="cand.outcome === 'pending'" class="cand-actions">
          <button
            v-if="!cand.auditioned"
            type="button"
            class="paper-btn"
            :data-testid="`btn-audition-${cand.id}`"
            @click="emit('audition', cand.id)"
          >
            山门试艺（揭露底细）
          </button>

          <div class="cand-invite-row">
            <select
              :value="getSeatChoice(cand)"
              @change="setSeatChoice(cand.id, ($event.target as HTMLSelectElement).value as 'outer' | 'alchemy_hall' | 'sword_pavilion')"
              class="paper-select"
              aria-label="选择所许席位"
            >
              <option value="outer">许以：外门正式席</option>
              <option value="alchemy_hall">许以：丹堂师承席</option>
              <option value="sword_pavilion">许以：试剑台练剑席</option>
            </select>
            <button
              type="button"
              class="cta-nephrite-btn"
              :style="{ backgroundImage: `url(${assetUrl('assets/ui/celestial_jade_nephrite_button.webp')})` }"
              :disabled="recruitment.remainingSeats <= 0"
              :data-testid="`btn-invite-${cand.id}`"
              @click="emit('invite', cand.id, getSeatChoice(cand))"
            >
              邀其入门
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
