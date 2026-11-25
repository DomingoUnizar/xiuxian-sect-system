<script setup lang="ts">
import { computed } from 'vue';
import { getItemById } from '../../content/validate';
import type { SectInventory } from '../../sim/types';
import { groupWeaponsByKind, type RarityFrameKey } from '../visuals/assetRegistry';
import ItemSlot from './ItemSlot.vue';

const props = defineProps<{
  inventory: SectInventory;
}>();

const groupedWeapons = computed(() => groupWeaponsByKind(props.inventory.weapons));

const emit = defineEmits<{
  (e: 'open-vault'): void;
}>();

function getPillRarity(pillId: string): RarityFrameKey {
  if (pillId.includes('high')) return 'amethyst';
  if (pillId.includes('_2_')) return 'jade';
  if (pillId.includes('mid')) return 'bronze';
  return 'wood';
}
</script>

<template>
  <section class="parchment-card vault-mini-card" data-testid="inventory-panel">
    <header class="card-header">
      <div class="card-title-group">
        <div>
          <h2 class="card-title">宗门丹库 · 本届灵材与法器摘要</h2>
          <p class="card-sub">丹成自动记入库藏或同门去向，凡炉 × {{ inventory.furnaces }}</p>
        </div>
      </div>
      <button type="button" class="paper-btn subtle" @click="emit('open-vault')">百宝库详单</button>
    </header>

    <div class="item-slot-grid" data-testid="pill-vault-list">
      <ItemSlot
        icon-path="assets/icons/relics-01.png"
        label="丹堂凡炉"
        rarity="bronze"
        :count="inventory.furnaces"
        subtitle="入阶开炉炼丹"
        :size="48"
      />

      <template v-for="(qty, id) in inventory.pills" :key="id">
        <ItemSlot
          v-if="qty > 0"
          :icon-path="getItemById(String(id))?.icon ?? 'assets/icons/pills-01.png'"
          :label="getItemById(String(id))?.name ?? String(id)"
          :rarity="getPillRarity(String(id))"
          :count="qty"
          subtitle="存于宗门丹库"
          :size="48"
        />
      </template>

      <ItemSlot
        v-for="(qty, id) in inventory.herbs"
        :key="id"
        :icon-path="getItemById(String(id))?.icon ?? 'assets/icons/botanical-01.png'"
        :label="getItemById(String(id))?.name ?? String(id)"
        :rarity="String(id) === 'herb_humai' ? 'bronze' : 'wood'"
        :count="qty"
        subtitle="灵草药材"
        :size="48"
      />

      <ItemSlot
        icon-path="assets/icons/talismans-01.png"
        label="凡阶遁符"
        rarity="bronze"
        :count="inventory.talismans.talisman_escape ?? 0"
        subtitle="山外历练护身"
        :size="48"
      />

      <ItemSlot
        v-for="wg in groupedWeapons"
        :key="wg.key"
        :icon-path="wg.sample.iconPath ?? 'assets/weapons/sword_t01_001.png'"
        :label="`${wg.sample.name}${wg.sample.refineLevel ? ` +${wg.sample.refineLevel}` : ''}`"
        rarity="wood"
        :count="wg.count"
        :subtitle="`${wg.sample.tier}${wg.sample.quality}`"
        :size="48"
      />

      <ItemSlot
        icon-path="assets/icons/jewels-01.png"
        label="下品灵石"
        rarity="dragon"
        :count="inventory.spiritStones.low"
        :subtitle="`中${inventory.spiritStones.mid} · 上${inventory.spiritStones.high} · 极${inventory.spiritStones.supreme} (1:10,000)`"
        :size="48"
      />
    </div>
  </section>
</template>
