<script setup lang="ts">
import { computed } from "vue";
import type { Battle, MissionConfig, MissionType } from "../../../shared/types";
import { key } from "../../../shared/document";
import {
  missionBriefs,
  missionNames,
  missionProgress,
} from "../model/mission";
const props = defineProps<{
  battle: Battle;
  draft: MissionConfig;
  deploying: boolean;
  zoneMode: "exit" | "zone" | null;
}>();
const emit = defineEmits<{
  patch: [patch: Partial<MissionConfig>];
  zone: [mode: "exit" | "zone" | null];
  apply: [];
}>();
const types: MissionType[] = ["annihilation", "escort", "control", "survival"];
const progress = computed(() => missionProgress(props.battle));
const azureUnits = computed(() =>
  props.battle.units.filter((u) => u.team === "azure"),
);
const zoneKeys = computed(() => {
  if (props.draft.type === "escort")
    return new Set((props.draft.exit ?? []).map(key));
  if (props.draft.type === "control")
    return new Set((props.draft.zone ?? []).map(key));
  return new Set<string>();
});
</script>
<template>
  <section class="panel mission-panel">
    <div class="eyebrow">00 / MISSION BRIEFING</div>
    <h3>
      任务配置
      <small>{{ deploying ? "部署阶段可编辑" : "战斗进行中 · 已锁定" }}</small>
    </h3>
    <div class="mission-types">
      <button
        v-for="t in types"
        :key="t"
        :class="{ chosen: draft.type === t }"
        :disabled="!deploying"
        @click="emit('patch', { type: t })"
      >
        {{ missionNames[t] }}
      </button>
    </div>
    <p class="instruction">{{ missionBriefs[draft.type] }}</p>

    <template v-if="deploying">
      <div v-if="draft.type === 'escort'" class="mission-form">
        <label
          >护送目标
          <select
            :value="draft.escortId"
            @change="
              emit('patch', {
                escortId: ($event.target as HTMLSelectElement).value,
              })
            "
          >
            <option
              v-for="u in azureUnits"
              :key="u.id"
              :value="u.id"
              :disabled="u.hp <= 0"
            >
              {{ u.name }} · {{ u.job }}
            </option>
          </select>
        </label>
        <button
          class="zone-btn"
          :class="{ chosen: zoneMode === 'exit' }"
          @click="emit('zone', zoneMode === 'exit' ? null : 'exit')"
        >
          {{ zoneMode === "exit" ? "点击地图格移除出口" : "在地图上绘制出口区域" }}
        </button>
        <small class="zone-count">已选 {{ zoneKeys.size }} 格出口</small>
      </div>

      <div v-else-if="draft.type === 'control'" class="mission-form">
        <label
          >持续占点回合
          <input
            type="number"
            min="1"
            max="12"
            :value="draft.holdRounds"
            @input="
              emit('patch', {
                holdRounds: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
        </label>
        <button
          class="zone-btn"
          :class="{ chosen: zoneMode === 'zone' }"
          @click="emit('zone', zoneMode === 'zone' ? null : 'zone')"
        >
          {{ zoneMode === "zone" ? "点击地图格移除占点" : "在地图上绘制占点区域" }}
        </button>
        <small class="zone-count">已选 {{ zoneKeys.size }} 格占点区域</small>
      </div>

      <div v-else-if="draft.type === 'survival'" class="mission-form">
        <label
          >回合上限
          <input
            type="number"
            min="1"
            max="20"
            :value="draft.roundLimit"
            @input="
              emit('patch', {
                roundLimit: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
        </label>
        <small class="zone-count">进入第 {{ draft.roundLimit }} 回合即成功</small>
      </div>

      <button class="primary apply-mission" @click="emit('apply')">
        应用任务配置
      </button>
    </template>

    <div v-else class="mission-live">
      <div class="mission-progress-head">
        <b>{{ progress.text }}</b>
        <span>{{ progress.percent }}%</span>
      </div>
      <div class="mission-progress-track">
        <i :style="{ width: progress.percent + '%' }" />
      </div>
      <small>{{ progress.detail }}</small>
      <div v-if="battle.ended" class="mission-result" :class="battle.ended">
        {{ battle.ended === "azure" ? "任务成功" : "任务失败" }} ·
        {{ battle.endReason }}
      </div>
    </div>
  </section>
</template>
