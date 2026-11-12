<script setup lang="ts">
import { computed } from "vue";
import type { Battle, Point } from "../../../shared/types";
import { key } from "../../../shared/document";
import { terrainRules } from "../lib/cost";
import { normalizeMission } from "../../mission/model/mission";
const props = defineProps<{
  battle: Battle;
  selected: string;
  routes: string[];
  targets: string[];
  path: Point[];
}>();
defineEmits<{ cell: [point: Point] }>();
const mission = computed(() => normalizeMission(props.battle.mission, props.battle));
const exitKeys = computed(
  () => new Set((mission.value.exit ?? []).map(key)),
);
const zoneKeys = computed(
  () => new Set((mission.value.zone ?? []).map(key)),
);
const escortId = computed(() =>
  mission.value.type === "escort" ? mission.value.escortId : null,
);
function tileClass(tile: Point) {
  const k = key(tile);
  return {
    "exit-zone": exitKeys.value.has(k),
    "control-zone": zoneKeys.value.has(k),
  };
}
</script>
<template>
  <section class="map-frame">
    <div class="map-caption">
      <span>渡口 07 / 北部边境</span><span>12 × 8 · 四向网格</span>
    </div>
    <div class="battle-map" role="grid" aria-label="战术地图">
      <button
        v-for="tile in battle.tiles"
        :key="key(tile)"
        :data-cell="key(tile)"
        :class="[
          'tile',
          tile.terrain,
          tileClass(tile),
          {
            reachable: routes.includes(key(tile)),
            target: targets.includes(key(tile)),
            trail: path.some((p) => key(p) === key(tile)),
          },
        ]"
        :aria-label="`${tile.x},${tile.y} ${terrainRules[tile.terrain].name}`"
        @click="$emit('cell', tile)"
      >
        <span class="ground">{{ terrainRules[tile.terrain].glyph }}</span>
        <span v-if="exitKeys.has(key(tile))" class="zone-glyph exit">出</span>
        <span v-else-if="zoneKeys.has(key(tile))" class="zone-glyph zone">点</span>
        <template
          v-for="unit in battle.units.filter(
            (u) => u.hp > 0 && key(u) === key(tile),
          )"
          :key="unit.id"
          ><span
            :class="[
              'pawn',
              unit.team,
              {
                selected: unit.id === selected,
                active: unit.id === battle.active,
                escort: unit.id === escortId,
              },
            ]"
            >{{
              unit.job === "guard"
                ? "♜"
                : unit.job === "ranger"
                  ? "➶"
                  : unit.job === "mage"
                    ? "✦"
                    : "✚"
            }}<i
              :style="{
                width: (unit.hp / unit.maxHp) * 100 + '%',
              }" /><em v-if="unit.id === escortId" class="escort-tag">护</em></span></template
        ><small>{{ tile.x + 1 }}·{{ tile.y + 1 }}</small>
      </button>
    </div>
    <div class="map-caption">
      <span>浅滩纵贯南北 · 中央石桥可快速渡河</span
      ><span
        >◇ 当前行动　● 可移动　◈ 技能目标　<span class="legend-exit">出</span>
        出口　<span class="legend-zone">点</span> 占点　护 护送目标</span
      >
    </div>
  </section>
</template>
