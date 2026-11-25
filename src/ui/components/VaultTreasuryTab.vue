<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  COMPENDIUM_LORE,
  resolveCompendiumVisual,
  type CompendiumKind,
} from '../../content/narrativePools';
import { getItemById } from '../../content/validate';
import { getCurrentConquestStage, getStrongestActiveMember } from '../../sim/conquest';
import { computeMemberPowerScore } from '../../sim/power';
import { getSpiritVeinSpec } from '../../sim/treasury';
import type { SystemView } from '../../sim/types';
import { assetUrl } from '../assetUrl';
import {
  FULL_WEAPON_CATALOG,
  groupWeaponsByKind,
  resolveOpponentAvatar,
  resolveQualityRarity,
  type RarityFrameKey,
} from '../visuals/assetRegistry';
import ItemSlot from './ItemSlot.vue';
import RichText from './RichText.vue';

const props = defineProps<{
  systemView: SystemView;
}>();

const emit = defineEmits<{
  upgradeVein: [];
  openMysteryBox: [];
  exchangeStones: [tier: 'low' | 'mid' | 'high'];
  restockHerbs: [];
  refineWeapon: [memberId: string];
  launchConquest: [memberId: string];
}>();

const conquestStageSpec = computed(() => getCurrentConquestStage(props.systemView.conquestStage ?? 0));
const strongestFighter = computed(() => getStrongestActiveMember(props.systemView));
const strongestPower = computed(() =>
  strongestFighter.value ? computeMemberPowerScore(strongestFighter.value) : 0,
);
const conquestInFlight = computed(() =>
  props.systemView.missions.some(
    (m) => m.targetType === 'conquer_frontline' && (m.status === 'issued' || m.status === 'accepted'),
  ),
);

const currentVein = computed(() => getSpiritVeinSpec(props.systemView.sectSpiritVeinLevel ?? 1));
const nextVein = computed(() =>
  (props.systemView.sectSpiritVeinLevel ?? 1) < 5
    ? getSpiritVeinSpec((props.systemView.sectSpiritVeinLevel ?? 1) + 1)
    : null,
);
const canAffordNextVein = computed(() => {
  if (!nextVein.value) return false;
  const s = props.systemView.inventory.spiritStones;
  return s.low >= nextVein.value.costLow && s.mid >= nextVein.value.costMid && s.high >= nextVein.value.costHigh;
});
const weaponBearers = computed(() =>
  props.systemView.members.filter((m) => m.status === 'active' && m.binding.bound && Boolean(m.equippedWeapon)),
);

const filterCat = ref<'all' | 'pills' | 'weapons' | 'herbs' | 'armory' | 'compendium'>('all');
const compendiumKind = ref<'all' | CompendiumKind>('all');

const COMPENDIUM_KIND_LABELS: Array<{ key: 'all' | CompendiumKind; label: string }> = [
  { key: 'all', label: '全百卷' },
  { key: 'weapon', label: '十二兵械' },
  { key: 'pill', label: '灵丹' },
  { key: 'herb', label: '灵草' },
  { key: 'manual', label: '典籍' },
  { key: 'talisman', label: '符箓' },
  { key: 'beast', label: '妖兽' },
];

const FEATURED_COMPENDIUM_IDS = new Set([
  'lore_002',
  'lore_026',
  'lore_044',
  'lore_059',
  'lore_075',
  'lore_099',
]);

const visibleCompendium = computed(() => {
  if (filterCat.value === 'compendium') {
    return compendiumKind.value === 'all'
      ? COMPENDIUM_LORE
      : COMPENDIUM_LORE.filter((entry) => entry.kind === compendiumKind.value);
  }
  return COMPENDIUM_LORE.filter((entry) => FEATURED_COMPENDIUM_IDS.has(entry.id));
});

const totalStones = computed(() => props.systemView.inventory.spiritStones);
const groupedVaultWeapons = computed(() =>
  groupWeaponsByKind(props.systemView.inventory.weapons),
);

function pillRarity(id: string): RarityFrameKey {
  if (id.includes('supreme')) return 'dragon';
  if (id.includes('high')) return 'amethyst';
  if (id.includes('_2_')) return 'jade';
  if (id.includes('mid')) return 'bronze';
  return 'wood';
}

const recentAlchemy = computed(() =>
  Object.values(props.systemView.alchemyFacts).slice(-6).reverse(),
);

const recentBattles = computed(() =>
  Object.values(props.systemView.battleFacts).slice(-6).reverse(),
);

const recentForging = computed(() =>
  Object.values(props.systemView.forgingFacts ?? {}).slice(-4).reverse(),
);

const recentBeasts = computed(() =>
  Object.values(props.systemView.beastFacts ?? {}).slice(-4).reverse(),
);

function getActorName(id: string): string {
  return props.systemView.members.find((m) => m.id === id)?.name ?? id;
}
</script>

<template>
  <div class="drawer-stack" data-testid="vault-treasury-panel">
    <!-- 顶部藏宝意境条 -->
    <section class="parchment-card mood-header-card">
      <img
        class="mood-banner-img"
        :src="assetUrl('assets/scenes/13_volcano_cauldron.webp')"
        alt="宗门丹库秘藏"
      />
      <div class="mood-overlay">
        <div>
          <h2>丹库 · 百宝秘藏</h2>
          <p>品阶框依一至六阶区分：凡木 · 灵铜 · 玄玉 · 地紫 · 天龙 · 仙凰</p>
        </div>
        <span class="paper-pill gold">凡炉 × {{ systemView.inventory.furnaces }}</span>
      </div>
    </section>

    <!-- 四阶灵石与分类筛 -->
    <section class="parchment-card">
      <div class="stone-strip">
        <div class="stone-cell tier-low">
          <span>下品灵石</span>
          <strong>{{ totalStones.low }}</strong>
        </div>
        <div class="stone-cell tier-mid">
          <span>中品灵石</span>
          <strong>{{ totalStones.mid }}</strong>
        </div>
        <div class="stone-cell tier-high">
          <span>上品灵石</span>
          <strong>{{ totalStones.high }}</strong>
        </div>
        <div class="stone-cell tier-supreme">
          <span>极品灵石</span>
          <strong>{{ totalStones.supreme }}</strong>
        </div>
      </div>

      <!-- 宗门福地灵脉 & 仙坊百宝阁消费闭环（置顶方便开盲盒与升阶） -->
      <div class="treasury-shop-panel" data-testid="sect-treasury-shop">
        <div class="vein-upgrade-banner">
          <div>
            <div class="vein-title-row">
              <span class="paper-pill gold">灵脉 {{ currentVein.level }} 阶 · {{ currentVein.name }}</span>
              <span class="vein-sub">下届招贤席位 {{ Math.min(4, 2 + Math.max(0, currentVein.level - 1)) }}</span>
            </div>
            <p class="vein-desc"><RichText :text="currentVein.bonusDesc" theme="dark" /></p>
            <p v-if="nextVein" class="vein-next-hint"><RichText :text="`下阶「${nextVein.name}」：${nextVein.bonusDesc}`" theme="dark" /></p>
          </div>
          <button
            type="button"
            class="conquest-launch-btn"
            style="width: auto; min-width: 158px"
            data-testid="btn-upgrade-spirit-vein"
            :disabled="!nextVein || !canAffordNextVein"
            @click="emit('upgradeVein')"
          >
            {{ nextVein ? `🏛️ 升阶 (${nextVein.costLabel})` : '✨ 已臻太古圣地' }}
          </button>
        </div>

        <div class="shop-actions-grid">
          <button
            type="button"
            class="miracle-btn gold"
            data-testid="btn-open-mystery-box"
            :disabled="totalStones.low < 60"
            @click="emit('openMysteryBox')"
          >
            <span class="miracle-top"><strong>🔮 天机盲盒</strong><em>60 下品</em></span>
            <span class="miracle-desc"><RichText text="必出仙兵/道源/极品丹/中品石！" /></span>
          </button>

          <button
            type="button"
            class="miracle-btn jade"
            data-testid="btn-restock-herbs"
            :disabled="totalStones.low < 40"
            @click="emit('restockHerbs')"
          >
            <span class="miracle-top"><strong>🌿 补灵草潮玉</strong><em>40 下品</em></span>
            <span class="miracle-desc"><RichText text="速补草药22株与「潮纹玉」×2" /></span>
          </button>

          <button
            type="button"
            class="miracle-btn tide"
            data-testid="btn-exchange-low"
            :disabled="totalStones.low < 100"
            @click="emit('exchangeStones', 'low')"
          >
            <span class="miracle-top"><strong>⚗️ 下品石炼源</strong><em>100 下品</em></span>
            <span class="miracle-desc"><RichText text="立刻转化 +20 点可用道源" /></span>
          </button>

          <button
            type="button"
            class="miracle-btn amethyst"
            data-testid="btn-exchange-mid"
            :disabled="totalStones.mid < 1"
            @click="emit('exchangeStones', 'mid')"
          >
            <span class="miracle-top"><strong>⚗️ 中品石炼源</strong><em>1 中品</em></span>
            <span class="miracle-desc"><RichText text="立刻转化 +50 点可用道源" /></span>
          </button>

          <button
            v-if="totalStones.high > 0"
            type="button"
            class="miracle-btn imperial unlocked"
            data-testid="btn-exchange-high"
            @click="emit('exchangeStones', 'high')"
          >
            <span class="miracle-top"><strong>👑 上品仙石爆炼道源</strong><em>1 上品</em></span>
            <span class="miracle-desc"><RichText text="瞬间爆产 +150 点可用道源！" theme="dark" /></span>
          </button>
        </div>

        <div v-if="weaponBearers.length > 0" class="refine-strip">
          <span class="field-caption">⚒️ 器堂淬兵强化（80下品石或1中品石，每次 攻+22 / 防+10）：</span>
          <div class="refine-chips">
            <button
              v-for="wb in weaponBearers"
              :key="`ref-${wb.id}`"
              type="button"
              class="paper-btn"
              :disabled="(wb.equippedWeapon?.refineLevel ?? 0) >= 9 || (totalStones.low < 80 && totalStones.mid < 1)"
              @click="emit('refineWeapon', wb.id)"
            >
              ⚒️ {{ wb.name }}「{{ wb.equippedWeapon?.name }}」{{ wb.equippedWeapon?.refineLevel ? `+${wb.equippedWeapon.refineLevel}` : '+0' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 诸域远征夺宝 -->
      <div class="conquest-banner-card" style="margin-top: 10px" data-testid="conquest-banner">
        <div class="conquest-head">
          <div class="conquest-boss-row">
            <img
              class="conquest-boss-avatar"
              :src="assetUrl(resolveOpponentAvatar(conquestStageSpec.opponent, conquestStageSpec.stageIndex))"
              :alt="conquestStageSpec.opponent.name"
            />
            <div class="conquest-copy">
              <div class="conquest-badge-row">
                <span class="conquest-stage-badge">{{ conquestStageSpec.badge }}</span>
                <span class="conquest-power-badge" :class="strongestPower >= conquestStageSpec.opponent.powerScore ? 'win' : 'warn'">
                  {{ strongestFighter?.name ?? '门人' }} {{ strongestPower }} vs {{ conquestStageSpec.opponent.name }} {{ conquestStageSpec.opponent.powerScore }}
                </span>
              </div>
              <h3>{{ conquestStageSpec.title }}</h3>
            </div>
          </div>
        </div>
        <div class="conquest-foot">
          <span class="conquest-loot-tag">{{ conquestStageSpec.rewardSummary }}</span>
          <button
            type="button"
            class="conquest-launch-btn"
            data-testid="btn-conquer-frontline"
            :disabled="!strongestFighter || conquestInFlight || systemView.daoyuanAvailable < 8"
            @click="strongestFighter && emit('launchConquest', strongestFighter.id)"
          >
            {{ conquestInFlight ? '⚔️ 远征激战中' : `⚔️ 派 ${strongestFighter?.name ?? '强将'} 夺宝 (8道源)` }}
          </button>
        </div>
      </div>

      <div class="filter-chip-row" style="margin-top: 10px">
        <button type="button" class="target-chip" :class="{ active: filterCat === 'all' }" @click="filterCat = 'all'">全库一览</button>
        <button type="button" class="target-chip" :class="{ active: filterCat === 'pills' }" @click="filterCat = 'pills'">灵丹药草</button>
        <button type="button" class="target-chip" :class="{ active: filterCat === 'weapons' }" @click="filterCat = 'weapons'">佩器秘藏</button>
        <button type="button" class="target-chip" :class="{ active: filterCat === 'armory' }" @click="filterCat = 'armory'">十二兵械谱</button>
        <button
          type="button"
          class="target-chip"
          :class="{ active: filterCat === 'compendium' }"
          data-testid="btn-vault-compendium"
          @click="filterCat = 'compendium'"
        >
          百物图鉴志 (100)
        </button>
      </div>
    </section>

    <!-- 丹药、灵草与宗门现存法器格 -->
    <section class="parchment-card" v-if="filterCat !== 'armory' && filterCat !== 'compendium'">
      <header class="card-header">
        <h3 class="card-title">宗门实物库存与弟子随身佩器</h3>
        <span class="paper-pill">实物去向可查</span>
      </header>

      <div class="item-slot-grid" data-testid="pill-vault-list">
        <template v-if="filterCat === 'all' || filterCat === 'pills'">
          <template v-for="(qty, id) in systemView.inventory.pills" :key="id">
            <ItemSlot
              v-if="qty > 0"
              :icon-path="getItemById(String(id))?.icon ?? 'assets/icons/pills-01.png'"
              :label="getItemById(String(id))?.name ?? String(id)"
              :rarity="pillRarity(String(id))"
              :count="qty"
              subtitle="存于宗门丹库"
              :size="50"
            />
          </template>
          <ItemSlot
            v-for="(qty, id) in systemView.inventory.herbs"
            :key="id"
            :icon-path="getItemById(String(id))?.icon ?? 'assets/icons/botanical-01.png'"
            :label="getItemById(String(id))?.name ?? String(id)"
            :rarity="String(id) === 'mat_dew_petals' ? 'amethyst' : String(id) === 'herb_humai' ? 'bronze' : 'wood'"
            :count="qty"
            subtitle="药圃/灵谷入库灵草"
            :size="50"
          />
          <ItemSlot
            icon-path="assets/icons/jewels-02.png"
            label="潮纹玉"
            rarity="jade"
            :count="systemView.inventory.materials?.mat_chaowen_jade ?? 0"
            subtitle="炼器原材（剑格/炉胆）"
            :size="50"
          />
          <ItemSlot
            icon-path="assets/icons/relics-02.png"
            label="潮纹温脉炉胆"
            :rarity="systemView.inventory.furnaceHasWarmCore ? 'amethyst' : 'wood'"
            :count="systemView.inventory.furnaceHasWarmCore ? 1 : 0"
            :subtitle="systemView.inventory.furnaceHasWarmCore ? '已嵌凡炉 · 引潮稳温' : '尚未嵌装炉胆'"
            :size="50"
          />
          <ItemSlot
            icon-path="assets/icons/talismans-01.png"
            label="凡阶遁符"
            rarity="bronze"
            :count="systemView.inventory.talismans.talisman_escape ?? 0"
            subtitle="险境自动护身"
            :size="50"
          />
        </template>

        <template v-if="filterCat === 'all' || filterCat === 'weapons'">
          <ItemSlot
            v-for="wg in groupedVaultWeapons"
            :key="wg.key"
            :icon-path="wg.sample.iconPath ?? 'assets/weapons/sword_t01_001.png'"
            :label="`${wg.sample.name}${wg.sample.refineLevel ? ` +${wg.sample.refineLevel}` : ''}`"
            :rarity="resolveQualityRarity(wg.sample.quality, wg.sample.tier)"
            :count="wg.count"
            :subtitle="`藏器库 · ${wg.sample.tier}${wg.sample.quality} 攻+${wg.sample.attackBonus}`"
            :size="50"
          />
          <template v-for="m in systemView.members" :key="`w-${m.id}`">
            <ItemSlot
              v-if="m.equippedWeapon && m.status !== 'dead'"
              :icon-path="m.equippedWeapon.iconPath ?? 'assets/weapons/sword_t01_001.png'"
              :label="`${m.equippedWeapon.name}${m.equippedWeapon.refineLevel ? ` +${m.equippedWeapon.refineLevel}` : ''}`"
              :rarity="resolveQualityRarity(m.equippedWeapon.quality, m.equippedWeapon.tier)"
              :subtitle="`${m.name}佩带 · 攻+${m.equippedWeapon.attackBonus} 防+${m.equippedWeapon.defenseBonus}`"
              :size="50"
            />
          </template>
        </template>
      </div>
    </section>

    <!-- 十二类修仙兵械法宝图鉴（完整接入 Weapons_500 全门类） -->
    <section class="parchment-card" v-if="filterCat === 'all' || filterCat === 'armory'">
      <header class="card-header">
        <h3 class="card-title">修真界十二兵械法器录</h3>
        <span class="paper-pill gold">全门类器谱</span>
      </header>
      <div class="armory-showcase-grid">
        <ItemSlot
          v-for="item in FULL_WEAPON_CATALOG"
          :key="item.iconPath"
          :icon-path="item.iconPath"
          :label="item.label"
          :rarity="item.rarity"
          :subtitle="item.category"
          :size="46"
        />
      </div>
    </section>

    <!-- 修真界百物图鉴志（100 卷器物、百草、典籍与山野妖兽白描） -->
    <section
      class="parchment-card"
      v-if="filterCat === 'all' || filterCat === 'compendium'"
      data-testid="compendium-lore-section"
    >
      <header class="card-header">
        <div>
          <h3 class="card-title">修真界百物图鉴志</h3>
          <p class="card-sub">
            {{
              filterCat === 'compendium'
                ? `当前展示 ${visibleCompendium.length} / ${COMPENDIUM_LORE.length} 卷（凡阶至帝器品阶框一一对应）`
                : '收录全宗藏器、灵丹本草、秘传典籍、符箓与寒鸦岭妖兽简志'
            }}
          </p>
        </div>
        <button
          v-if="filterCat === 'all'"
          type="button"
          class="paper-btn"
          @click="filterCat = 'compendium'"
        >
          展开全部 100 卷
        </button>
        <span v-else class="paper-pill gold">{{ visibleCompendium.length }} 卷</span>
      </header>

      <div v-if="filterCat === 'compendium'" class="filter-chip-row" style="margin-bottom: 10px">
        <button
          v-for="tab in COMPENDIUM_KIND_LABELS"
          :key="tab.key"
          type="button"
          class="target-chip"
          :class="{ active: compendiumKind === tab.key }"
          @click="compendiumKind = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="compendium-grid">
        <article v-for="entry in visibleCompendium" :key="entry.id" class="compendium-card">
          <div class="compendium-top">
            <ItemSlot
              :icon-path="resolveCompendiumVisual(entry).iconPath"
              :label="entry.name"
              :rarity="resolveCompendiumVisual(entry).rarity"
              :subtitle="`${entry.tier} · ${COMPENDIUM_KIND_LABELS.find((k) => k.key === entry.kind)?.label ?? entry.kind}`"
              :size="42"
            />
          </div>
          <p class="compendium-lore"><RichText :text="entry.lore" /></p>
        </article>
      </div>
    </section>

    <!-- 宗门灵兽伙伴 -->
    <section
      class="parchment-card"
      v-if="filterCat === 'all' && systemView.spiritBeasts.length > 0"
      data-testid="vault-beasts-section"
    >
      <header class="card-header">
        <h3 class="card-title">灵兽园 · 山门结契灵兽</h3>
        <span class="paper-pill">{{ systemView.spiritBeasts.length }} 头在籍</span>
      </header>
      <div class="records-list">
        <div v-for="beast in systemView.spiritBeasts" :key="beast.id" class="beast-row">
          <img :src="assetUrl(`assets/beasts/${beast.portraitId}.png`)" :alt="beast.name" />
          <div style="flex: 1; min-width: 0">
            <div class="record-top">
              <strong><b class="rt-name">{{ beast.name }}</b>（{{ beast.species }}）</strong>
              <span class="paper-pill" :class="beast.awakened ? 'gold' : ''">
                {{ beast.awakened ? '✓ 血脉已醒' : '常态驯养' }}
              </span>
            </div>
            <div class="record-sub">
              <RichText
                :text="`特性：${beast.traits.join(' · ')}${beast.bondedMemberId ? ` · 结契：${getActorName(beast.bondedMemberId)}` : ''}`"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 丹房成丹炉温报告、器堂与演武实录 -->
    <section
      class="parchment-card"
      v-if="recentAlchemy.length > 0 || recentBattles.length > 0 || recentForging.length > 0 || recentBeasts.length > 0"
    >
      <header class="card-header">
        <h3 class="card-title">近况百艺、炉灶与交锋实录</h3>
      </header>
      <div class="records-list">
        <div v-for="ff in recentForging" :key="ff.id" class="record-row">
          <div class="record-top">
            <strong><RichText :text="`${getActorName(ff.actorId)} · 「${ff.productName}」`" /></strong>
            <span class="paper-pill gold">{{ ff.methodName }}</span>
          </div>
          <div class="record-sub"><RichText :text="ff.shortReport" /></div>
        </div>
        <div v-for="bfst in recentBeasts" :key="bfst.id" class="record-row">
          <div class="record-top">
            <strong><RichText :text="`${getActorName(bfst.actorId)} · ${bfst.beastName}`" /></strong>
            <span class="paper-pill gold">寒泉采露</span>
          </div>
          <div class="record-sub"><RichText :text="bfst.shortReport" /></div>
        </div>
        <div v-for="af in recentAlchemy" :key="af.id" class="record-row">
          <div class="record-top">
            <strong><RichText :text="`${getActorName(af.actorId)} · 「${af.recipeName}」`" /></strong>
            <span class="paper-pill" :class="af.success ? 'gold' : 'warn'">
              {{ af.success ? '成丹入库' : '炸炉失手' }}
            </span>
          </div>
          <div class="record-sub"><RichText :text="af.shortReport" /></div>
        </div>
        <div v-for="bf in recentBattles" :key="bf.id" class="record-row">
          <div class="record-top">
            <strong><RichText :text="bf.shortReport" /></strong>
            <span class="paper-pill" :class="bf.outcome.includes('win') ? 'gold' : 'warn'">
              {{ bf.turns.length }} 合交手
            </span>
          </div>
          <div class="record-sub"><RichText :text="`${bf.contextAtStart.environment} · 主角战力 ${bf.contextAtStart.hostPower} 对 ${bf.contextAtStart.opponentPower}`" /></div>
        </div>
      </div>
    </section>
  </div>
</template>
