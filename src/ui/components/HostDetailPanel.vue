<script setup lang="ts">
import { computed, ref } from 'vue';
import { getItemById, getMethodById } from '../../content/validate';
import { RULE_GRANT_ABILITIES } from '../../sim/constants';
import { getTraitSpec } from '../../sim/destinyTraits';
import { computeMemberPowerScore, getCultivationPerRound } from '../../sim/power';
import type { HostEquipment, LedgerEntry, Member, Mission } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import {
  groupWeaponsByKind,
  resolveAvatarFrameUrl,
  resolveMethodVisual,
  resolvePortraitUrl,
  resolveWeaponVisual,
} from '../visuals/assetRegistry';
import { resolveRealmTierClass } from '../visuals/richText';
import ItemSlot from './ItemSlot.vue';
import JadeGauge from './JadeGauge.vue';
import RichText from './RichText.vue';

const props = defineProps<{
  member: Member;
  missions: Mission[];
  ledgerEntries: LedgerEntry[];
  availablePills: Record<string, number>;
  vaultWeapons?: HostEquipment[];
  showSecrets: boolean;
}>();

const emit = defineEmits<{
  depart: [memberId: string];
  rejoin: [memberId: string];
  consumePill: [memberId: string, pillId: string];
  equipWeapon: [memberId: string, weaponId: string];
  refineWeapon: [memberId: string];
  mentorDisciple: [memberId: string];
}>();

function abilityTitle(id: string): string {
  return RULE_GRANT_ABILITIES.find((a) => a.id === id)?.name ?? id;
}

const showRecords = ref(false);
const groupedVaultWeapons = computed(() => groupWeaponsByKind(props.vaultWeapons ?? []));

function roleLabel(role: Member['role']): string {
  if (role === 'sect_master') return '宗主';
  if (role === 'elder') return '长老';
  return '弟子';
}

function missionStatusText(status: Mission['status']): string {
  if (status === 'issued') return '待应令';
  if (status === 'accepted') return '履约中';
  if (status === 'completed') return '已兑现';
  if (status === 'declined') return '已推辞';
  if (status === 'failed') return '失利未成';
  return '已到期';
}
</script>

<template>
  <section class="parchment-card host-card" data-testid="host-detail-panel">
    <!-- 宿主玉框肖像主视觉 -->
    <div class="host-hero-band">
      <div class="host-identity-col">
        <div class="host-avatar-header">
          <div class="framed-avatar-box large">
            <img class="avatar-face" :src="assetUrl(resolvePortraitUrl(member.portraitId))" :alt="member.name" />
            <img class="avatar-rim" :src="assetUrl(resolveAvatarFrameUrl(member))" alt="" aria-hidden="true" />
          </div>
          <div style="min-width: 0; flex: 1">
            <div class="host-name-line">
              <h2 class="rt-name">{{ member.name }}</h2>
              <span class="paper-pill">{{ roleLabel(member.role) }}</span>
              <span class="paper-pill gold">
                <b :class="resolveRealmTierClass(member.realm)">{{ member.realm }}{{ member.realmLayer }}层</b>
              </span>
            </div>
            <div class="host-power-line" data-testid="host-power-badge">
              战力 <strong class="rt-stat-power">{{ computeMemberPowerScore(member) }}</strong> · 每轮吸收
              <strong class="rt-stat-jade">{{ getCultivationPerRound(member) }} 缕灵气</strong>
            </div>
          </div>
        </div>

        <p class="host-bg-text"><RichText :text="member.background" /></p>

        <div class="host-tags-strip">
          <span class="micro-badge">
            <img :src="assetUrl('assets/ui/shared_wuxing_symbol.webp')" alt="" aria-hidden="true" />
            <RichText :text="`${member.spiritRoot.grade}${member.spiritRoot.elements.join('')}灵根`" />
          </span>
          <span class="micro-badge">{{ member.personality }}</span>
          <span v-if="member.craftRank.alchemy > 0" class="micro-badge warm">丹修 {{ member.craftRank.alchemy }} 品</span>
          <span v-if="member.craftRank.forging > 0" class="micro-badge warm">器修 {{ member.craftRank.forging }} 品</span>
          <span
            v-for="abId in member.grantedAbilities ?? []"
            :key="abId"
            class="micro-badge gold"
            data-testid="host-ability-badge"
          >
            神通·{{ abilityTitle(abId) }}
          </span>
          <span v-if="member.hasCompletedFirstAlchemy" class="micro-badge jade">已成初丹</span>
          <span v-if="member.hasWonFirstArena" class="micro-badge jade">已夺首胜</span>
          <span v-for="inj in member.injuries" :key="inj" class="micro-badge warn">{{ inj }}</span>
        </div>

        <div v-if="member.destinyTraits && member.destinyTraits.length > 0" class="trait-badges-row">
          <span
            v-for="tid in member.destinyTraits"
            :key="tid"
            class="destiny-trait-pill"
            :class="getTraitSpec(tid).rarity"
            :title="getTraitSpec(tid).desc"
          >
            <b>{{ getTraitSpec(tid).name }}</b> · {{ getTraitSpec(tid).desc }}
          </span>
        </div>

        <!-- 实测保留 data-testid="host-cultivation-badge" 便于精准核对修为增长 -->
        <div class="host-cult-readout" data-testid="host-cultivation-badge">
          修为进度 <b class="rt-stat-amber">{{ member.cultivation }} / {{ member.cultivationCap }}</b> 缕 · 寿元 <b class="rt-stat-jade">{{ member.ageYears }}/{{ member.lifespanYears }}</b> 岁
        </div>
      </div>
    </div>

    <!-- 气血 / 灵力 / 修为 青玉槽 -->
    <div class="jade-gauges-row">
      <JadeGauge label="气血" :current="member.hp" :max="member.maxHp" kind="hp" />
      <JadeGauge label="灵力" :current="member.qi" :max="member.maxQi" kind="qi" />
      <JadeGauge label="修为" :current="member.cultivation" :max="member.cultivationCap" kind="exp" />
    </div>

    <!-- 五维资质彩色胶囊 -->
    <div class="aptitude-row">
      <span class="apt-pill apt-comp">悟性 <b>{{ member.aptitude.comprehension }}</b></span>
      <span class="apt-pill apt-bone">根骨 <b>{{ member.aptitude.bone }}</b></span>
      <span class="apt-pill apt-soul">神魂 <b>{{ member.aptitude.soul }}</b></span>
      <span class="apt-pill apt-mind">心性 <b>{{ member.aptitude.mindset }}</b></span>
      <span class="apt-pill apt-luck">气运 <b>{{ member.aptitude.luck }}</b></span>
    </div>

    <!-- 宿主佩器、功法与行囊遁符（T1..T6品阶框） -->
    <div class="item-slot-grid" data-testid="host-gear-grid">
      <ItemSlot
        :icon-path="resolveWeaponVisual(member).iconPath"
        :label="`${resolveWeaponVisual(member).name}${member.equippedWeapon?.refineLevel ? ` +${member.equippedWeapon.refineLevel}` : ''}`"
        :rarity="resolveWeaponVisual(member).rarity"
        :subtitle="member.equippedWeapon ? `${member.equippedWeapon.tier}${member.equippedWeapon.quality} · 攻+${member.equippedWeapon.attackBonus} 防+${member.equippedWeapon.defenseBonus}` : '随身常备法器'"
        :size="48"
      />
      <ItemSlot
        v-if="member.pouchTalismans > 0"
        icon-path="assets/icons/talismans-01.png"
        label="行囊遁符"
        rarity="bronze"
        :count="member.pouchTalismans"
        subtitle="险境护身脱逃"
        :size="48"
      />
      <ItemSlot
        v-for="mId in member.knownMethods"
        :key="mId"
        :icon-path="resolveMethodVisual(mId).iconPath"
        :label="getMethodById(mId)?.name ?? mId"
        :rarity="resolveMethodVisual(mId).rarity"
        :subtitle="`${getMethodById(mId)?.tier ?? '凡阶'}功法`"
        :size="48"
      />
    </div>

    <!-- 赐丹、淬兵、传功与进退操作条 -->
    <div v-if="member.status === 'active'" class="host-action-bar">
      <button
        v-if="member.equippedWeapon && (member.equippedWeapon.refineLevel ?? 0) < 9"
        type="button"
        class="paper-btn active"
        data-testid="btn-refine-weapon"
        @click="emit('refineWeapon', member.id)"
      >
        ⚒️ 淬兵强化 {{ member.equippedWeapon.refineLevel ? `+${member.equippedWeapon.refineLevel}→+${member.equippedWeapon.refineLevel + 1}` : '+1' }}（80下品石）
      </button>

      <button
        type="button"
        class="paper-btn active"
        data-testid="btn-mentor-disciple"
        @click="emit('mentorDisciple', member.id)"
      >
        🎓 前辈传功提点（+120修为·传法·8道源）
      </button>

      <template v-for="(qty, pillId) in availablePills" :key="pillId">
        <button
          v-if="qty > 0"
          type="button"
          class="paper-btn"
          :data-testid="`btn-consume-${pillId}`"
          @click="emit('consumePill', member.id, String(pillId))"
        >
          赐服「{{ getItemById(String(pillId))?.name ?? pillId }}」（库余 {{ qty }}）
        </button>
      </template>

      <button
        v-for="wg in groupedVaultWeapons"
        :key="wg.key"
        type="button"
        class="paper-btn"
        :data-testid="`btn-equip-weapon-${wg.sample.templateId}`"
        @click="emit('equipWeapon', member.id, wg.sample.id)"
      >
        换佩「{{ wg.sample.name }}」{{ wg.sample.refineLevel ? `+${wg.sample.refineLevel} ` : '' }}(攻+{{ wg.sample.attackBonus }}{{ wg.count > 1 ? ` · ×${wg.count}` : '' }})
      </button>

      <button
        v-if="member.role !== 'sect_master'"
        type="button"
        class="paper-btn subtle"
        data-testid="btn-member-depart"
        @click="emit('depart', member.id)"
      >
        办理退宗
      </button>
    </div>
    <div v-else-if="member.status === 'departed'" class="host-action-bar">
      <button
        type="button"
        class="paper-btn active"
        data-testid="btn-member-rejoin"
        @click="emit('rejoin', member.id)"
      >
        重归山门（续接原身份）
      </button>
    </div>

    <!-- 私人秘令与实奖入账记录（默认折叠，标题附最新状态） -->
    <div v-if="showSecrets" class="host-records-block">
      <button type="button" class="records-toggle" @click="showRecords = !showRecords">
        <span>
          <RichText
            :text="`私令·账本（${missions.length} 道 / ${ledgerEntries.length} 笔）${
              missions.length > 0
                ? ` · 最新「${missions[missions.length - 1].title}」· ${missionStatusText(missions[missions.length - 1].status)}`
                : ''
            }`"
          />
        </span>
        <span>{{ showRecords ? '收起' : '展开' }}</span>
      </button>

      <div v-if="showRecords" class="records-list">
        <div v-if="missions.length === 0" class="empty-note">暂未向其秘密下发过悬赏。</div>
        <div
          v-for="ms in [...missions].reverse().slice(0, 10)"
          :key="ms.id"
          class="record-row"
          :data-testid="`host-mission-${ms.id}`"
        >
          <div class="record-top">
            <strong><RichText :text="`「${ms.title}」`" /></strong>
            <span
              class="paper-pill"
              :class="ms.status === 'completed' ? 'gold' : ms.status === 'declined' || ms.status === 'failed' || ms.status === 'expired' ? 'warn' : ''"
            >
              {{ missionStatusText(ms.status) }}
            </span>
          </div>
          <div class="record-sub"><RichText :text="`明奖：${ms.primaryReward.label}`" /></div>
          <div v-if="ms.hiddenReward" class="record-sub" :data-testid="`mission-hidden-${ms.id}`">
            <RichText :text="`隐藏机缘：${ms.hiddenReward.hiddenConditionLabel ?? ms.hiddenReward.label}`" /> ·
            <strong :class="ms.hiddenSettled ? 'rt-stat-jade' : 'rt-stat-amber'">{{ ms.hiddenSettled ? '✓ 已触发兑现' : ms.hiddenReleased ? '已到期释放' : '预留待触发' }}</strong>
          </div>
          <div v-if="ms.decisionReason" class="record-sub"><RichText :text="ms.decisionReason" /></div>
        </div>

        <ul v-if="ledgerEntries.length > 0" class="ledger-ul">
          <li v-for="l in [...ledgerEntries].reverse().slice(0, 10)" :key="l.id">
            <RichText :text="l.summary" />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
