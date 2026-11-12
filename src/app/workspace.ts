import { computed, reactive, ref } from "vue";
import type { Point, Terrain, MissionConfig } from "../shared/types";
import { clone, findUnit, key } from "../shared/document";
import { reachable, terrainRules, paintTile } from "../features/terrain";
import { moveBudget, armorValue, tickStatuses } from "../features/roster";
import {
  getSkill,
  legalTargets,
  moveUnit,
  castSkill,
} from "../features/tactics";
import { finishTurn } from "../features/initiative";
import {
  record,
  frame,
  loadArchive,
  saveArchive,
  usePlayback,
} from "../features/replay";
import {
  createMissionState,
  normalizeMission,
  settleMission,
  validateMission,
  withType,
} from "../features/mission/model/mission";
import { newSession } from "./session";

export function useWorkspace() {
  const session = reactive(loadArchive() ?? newSession());
  const cursor = ref(-1),
    selected = ref(session.live.active),
    skill = ref(""),
    brush = ref<Terrain | null>(null),
    notice = ref("选择蓝色格移动，或选择技能。"),
    // 部署阶段任务配置草稿，应用前不影响实战数据
    missionDraft = ref<MissionConfig>(clone(session.live.mission)),
    // 正在地图上绘制的目标区域：exit（护送出口）/ zone（占点）
    zoneMode = ref<"exit" | "zone" | null>(null);
  const playback = usePlayback(
    () => session.events.length,
    (n) => {
      cursor.value = n;
    },
  );
  const battle = computed(() => frame(session, cursor.value));
  const actor = computed(() => findUnit(battle.value, battle.value.active));
  /** 部署阶段：未产生任何行动记录且战斗未结束，此时可编辑任务 */
  const deploying = computed(
    () => session.events.length === 0 && !session.live.ended,
  );
  const locked = computed(() => cursor.value >= 0 || !!session.live.ended);

  function persist() {
    try {
      saveArchive(session);
    } catch (e) {
      notice.value = `存档失败：${(e as Error).message}，原记录未被覆盖`;
    }
  }

  const routes = computed(() =>
    locked.value || actor.value.moved || actor.value.acted
      ? new Map()
      : reachable(session.live, actor.value, moveBudget(actor.value)),
  );
  const targets = computed(() => {
    const s = getSkill(actor.value.job, skill.value);
    return s ? legalTargets(battle.value, actor.value, s) : [];
  });

  /** 部署阶段在地图上增删目标区域格 */
  function editZone(p: Point) {
    const draft = clone(missionDraft.value);
    const field = zoneMode.value === "exit" ? "exit" : "zone";
    const list = [...(draft[field] ?? [])];
    const i = list.findIndex((v) => key(v) === key(p));
    if (i >= 0) list.splice(i, 1);
    else list.push({ x: p.x, y: p.y });
    draft[field] = list;
    missionDraft.value = draft;
    notice.value = `目标区域已${i >= 0 ? "移除" : "加入"}格 ${p.x + 1}·${p.y + 1}，点击「应用任务配置」生效`;
  }

  /** 切换任务类型时补齐新类型所需字段 */
  function patchMission(patch: Partial<MissionConfig>) {
    const current = missionDraft.value;
    if (patch.type && patch.type !== current.type) {
      missionDraft.value = withType(
        patch.type,
        { ...current, ...patch },
        session.live,
      );
    } else {
      missionDraft.value = { ...current, ...patch };
    }
  }

  /** 校验并把草稿写入实战与初始快照，损坏 / 非法配置不会覆盖原数据 */
  function applyMission() {
    if (!deploying.value) {
      notice.value = "战斗开始后任务配置锁定，请重新部署后再调整";
      return;
    }
    const cfg = normalizeMission(missionDraft.value, session.live);
    const error = validateMission(cfg, session.live);
    if (error) {
      notice.value = `任务配置无效：${error}`;
      return;
    }
    session.live.mission = clone(cfg);
    session.live.missionState = createMissionState();
    session.live.ended = null;
    session.live.endReason = null;
    session.initial = clone(session.live);
    session.events.splice(0, session.events.length);
    missionDraft.value = clone(cfg);
    zoneMode.value = null;
    persist();
    notice.value = "任务配置已应用并写入战斗记录";
  }

  function cell(p: Point) {
    try {
      if (locked.value) throw new Error("回放只读，请返回实战");
      if (zoneMode.value) {
        if (!deploying.value) throw new Error("部署阶段才能编辑目标区域");
        editZone(p);
        return;
      }
      const before = clone(session.live),
        u = actor.value;
      if (brush.value) {
        paintTile(session.live, p, brush.value);
        record(
          session,
          before,
          "terrain",
          `地形调整为${terrainRules[brush.value].name}`,
        );
      } else if (skill.value) {
        const s = getSkill(u.job, skill.value)!;
        const t = session.live.units.find((t) => t.hp > 0 && key(t) === key(p));
        if (!t) throw new Error("请点击合法角色");
        const ground = session.live.tiles.find((v) => key(v) === key(t))!;
        const high =
          session.live.tiles.find((v) => key(v) === key(u))!.terrain ===
          "ridge";
        const value = castSkill(
          session.live,
          u.id,
          t.id,
          s,
          armorValue(t),
          terrainRules[ground.terrain].cover,
          high,
        );
        // 技能造成的击倒同样驱动任务结算（纳入行动提交，而非界面临时统计）
        settleMission(session.live, {});
        record(
          session,
          before,
          "skill",
          `${u.name} → ${t.name} · ${s.name} ${value}`,
        );
        skill.value = "";
      } else {
        const route = routes.value.get(key(p));
        if (!route?.path.length)
          throw new Error("此格不可达，请检查地形与占位");
        moveUnit(session.live, u.id, route.path);
        // 移动落点驱动同一任务状态
        settleMission(session.live, {});
        record(
          session,
          before,
          "move",
          `${u.name}移动 · 消耗${route.cost}`,
          route.path,
        );
      }
      persist();
      const last = session.events.at(-1);
      notice.value = session.live.ended
        ? `${last?.label ?? ""}｜${session.live.endReason}`
        : (last?.label ?? "");
      if (session.live.ended) {
        brush.value = null;
        skill.value = "";
      }
    } catch (e) {
      notice.value = (e as Error).message;
    }
  }
  function wait() {
    if (locked.value) return;
    const before = clone(session.live);
    const actorName = findUnit(before, before.active).name;
    finishTurn(session.live, tickStatuses);
    record(
      session,
      before,
      "wait",
      `${actorName}结束行动`,
    );
    selected.value = session.live.active;
    skill.value = "";
    persist();
    notice.value = session.live.ended
      ? `${actorName}结束行动｜${session.live.endReason}`
      : `${actorName}结束行动`;
  }
  function seek(n: number) {
    playback.stop();
    cursor.value = n;
    skill.value = "";
    brush.value = null;
    zoneMode.value = null;
  }
  function reset() {
    playback.stop();
    Object.assign(session, newSession());
    cursor.value = -1;
    selected.value = session.live.active;
    skill.value = "";
    brush.value = null;
    missionDraft.value = clone(session.live.mission);
    zoneMode.value = null;
    persist();
    notice.value = "新战斗已就绪";
  }
  const path = computed(() =>
    cursor.value > 0 ? (session.events[cursor.value - 1]?.path ?? []) : [],
  );
  return {
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
    setZoneMode: (m: "exit" | "zone" | null) => {
      zoneMode.value = m;
      brush.value = null;
      skill.value = "";
    },
  };
}
