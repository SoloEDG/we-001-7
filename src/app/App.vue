<script setup lang="ts">
import { computed } from "vue";
import { BattleMap, TerrainPanel } from "../features/terrain";
import { RosterPanel } from "../features/roster";
import { ActionPanel } from "../features/tactics";
import { TurnOrder } from "../features/initiative";
import { ReplayPanel, downloadArchive } from "../features/replay";
import { MissionPanel, missionBriefs, missionNames, normalizeMission } from "../features/mission";
import { key } from "../shared/document";
import { useWorkspace } from "./workspace";
const {
  session,
  cursor,
  selected,
  skill,
  brush,
  notice,
  battle,
  actor,
  locked,
  deploying,
  routes,
  targets,
  path,
  playback,
  missionDraft,
  zoneMode,
  cell,
  wait,
  seek,
  reset,
  patchMission,
  applyMission,
  setZoneMode,
} = useWorkspace();
const badge = computed(() => {
  const m = normalizeMission(battle.value.mission, battle.value);
  if (battle.value.ended)
    return {
      title: battle.value.ended === "azure" ? "任务成功" : "任务失败",
      sub: battle.value.endReason ?? "战斗结束",
    };
  return {
    title: missionNames[m.type],
    sub: missionBriefs[m.type],
  };
});
</script>
<template>
  <main>
    <header>
      <a class="brand" href="./"
        ><span class="brand-mark">⌘</span>
        <div>灰烬渡口<small>ASHEN CROSSING / TACTICS LAB</small></div></a
      >
      <nav>
        <span class="nav-active">战术指挥台</span><span>本地演练 / 07</span>
      </nav>
      <button @click="reset">↻ 重新部署</button>
    </header>
    <div class="mission">
      <div>
        <div class="eyebrow">OPERATION 001 / 北境战役</div>
        <h1>在河岸，决定下一步。</h1>
        <p>利用地形，掌握先机。每一次行动，都有迹可循。</p>
      </div>
      <div class="live-badge">
        <i :class="{ ended: !!battle.ended }" />{{
          cursor < 0 ? "实战指挥" : "历史回放 · 只读"
        }}<small>{{ badge.title }} · {{ badge.sub }}</small>
      </div>
    </div>
    <TurnOrder :battle="battle" />
    <div class="workspace">
      <aside>
        <MissionPanel
          :battle="battle"
          :draft="missionDraft"
          :deploying="deploying"
          :zone-mode="zoneMode"
          @patch="patchMission"
          @zone="setZoneMode"
          @apply="applyMission"
        />
        <RosterPanel
          :units="battle.units"
          :selected="selected"
          :active="battle.active"
          @select="selected = $event"
        /><TerrainPanel
          :brush="brush"
          :locked="locked || !!zoneMode"
          @paint="
            brush = $event;
            skill = '';
            setZoneMode(null);
          "
        />
      </aside>
      <div class="center">
        <BattleMap
          :battle="battle"
          :selected="selected"
          :routes="[...routes.keys()]"
          :targets="targets.map(key)"
          :path="path"
          @cell="cell"
        />
        <div class="field-note">
          <span>✦ 战场提示</span>
          <p>
            密林提供 3 点掩护；高地攻击 +2；迟缓减少 2
            点移动；灼烧在自身行动结束时结算。任务进度在每次行动提交时统一结算并随回放保存。
          </p>
        </div>
      </div>
      <aside>
        <ActionPanel
          :unit="actor"
          :skill="skill"
          :locked="locked"
          :notice="notice"
          @skill="
            skill = $event;
            brush = null;
            setZoneMode(null);
          "
          @wait="wait"
        /><ReplayPanel
          :events="session.events"
          :cursor="cursor"
          :playing="playback.playing.value"
          @seek="seek"
          @play="playback.play(cursor)"
          @stop="playback.stop"
          @download="downloadArchive(session)"
        />
      </aside>
    </div>
    <footer>
      <span>WE–001 / TURN-BASED TACTICS</span
      ><span>自动保存于当前浏览器　·　全部运算在本地完成</span
      ><span>苍蓝军 <b>VS</b> 余烬军</span>
    </footer>
  </main>
</template>
