import type {
  Battle,
  MissionConfig,
  MissionState,
  MissionType,
  Point,
} from "../../../shared/types";
import { key, living } from "../../../shared/document";

export const missionNames: Record<MissionType, string> = {
  annihilation: "歼灭任务",
  escort: "护送任务",
  control: "占点任务",
  survival: "限回合生存",
};

export const missionBriefs: Record<MissionType, string> = {
  annihilation: "消灭敌方所有角色获胜",
  escort: "护送目标存活抵达出口区域",
  control: "回合结束时持续占据目标区域",
  survival: "撑过限定回合即告成功",
};

const inZone = (zone: Point[] | undefined, x: number, y: number) =>
  !!zone?.some((p) => p.x === x && p.y === y);

/** 地图边界内的合法坐标（12 × 8） */
function clampPoints(points: Point[] | undefined): Point[] {
  if (!Array.isArray(points)) return [];
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of points) {
    if (
      !p ||
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      p.x < 0 ||
      p.x > 11 ||
      p.y < 0 ||
      p.y > 7
    )
      continue;
    const k = key(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * 归一化并校验任务配置。
 * 任何损坏 / 不完整的配置都回退为歼灭任务，保证战斗永远可结算。
 */
export function normalizeMission(
  raw: unknown,
  b?: Pick<Battle, "units" | "tiles">,
): MissionConfig {
  const fallback: MissionConfig = { type: "annihilation" };
  if (!raw || typeof raw !== "object") return fallback;
  const cfg = raw as Record<string, unknown>;
  switch (cfg.type) {
    case "escort": {
      const exit = clampPoints(cfg.exit as Point[] | undefined);
      if (!exit.length) return fallback;
      const units = b?.units;
      let escortId = typeof cfg.escortId === "string" ? cfg.escortId : "";
      if (units) {
        const valid = units.some((u) => u.id === escortId && u.team === "azure");
        if (!valid)
          escortId = units.find((u) => u.team === "azure")?.id ?? "";
      }
      if (!escortId) return fallback;
      return { type: "escort", escortId, exit };
    }
    case "control": {
      const zone = clampPoints(cfg.zone as Point[] | undefined);
      if (!zone.length) return fallback;
      const holdRounds = Number(cfg.holdRounds);
      return {
        type: "control",
        zone,
        holdRounds: Number.isFinite(holdRounds)
          ? Math.min(12, Math.max(1, Math.round(holdRounds)))
          : 3,
      };
    }
    case "survival": {
      const roundLimit = Number(cfg.roundLimit);
      if (!Number.isFinite(roundLimit) || roundLimit < 1) return fallback;
      return { type: "survival", roundLimit: Math.round(roundLimit) };
    }
    case "annihilation":
      return { type: "annihilation" };
    default:
      return fallback;
  }
}

export function createMissionState(): MissionState {
  return { reachedExit: false, hold: 0 };
}

/** 默认任务配置（部署阶段切换任务类型时使用） */
export function defaultMission(
  type: MissionType,
  b: Pick<Battle, "units" | "tiles">,
): MissionConfig {
  switch (type) {
    case "escort":
      return {
        type: "escort",
        escortId: b.units.find((u) => u.team === "azure")?.id ?? "",
        // 东岸桥头（x=7 列，浅滩东侧的两个通行格）
        exit: [
          { x: 7, y: 3 },
          { x: 7, y: 4 },
        ],
      };
    case "control":
      // 中央石桥
      return {
        type: "control",
        zone: [
          { x: 6, y: 3 },
          { x: 6, y: 4 },
        ],
        holdRounds: 3,
      };
    case "survival":
      return { type: "survival", roundLimit: 6 };
    default:
      return { type: "annihilation" };
  }
}

/** 切换任务类型时，在已有草稿上补全新类型需要的字段 */
export function withType(
  type: MissionType,
  draft: MissionConfig,
  b: Pick<Battle, "units" | "tiles">,
): MissionConfig {
  if (type === draft.type) return draft;
  const base = defaultMission(type, b);
  if (type === "escort")
    return { ...base, escortId: draft.escortId ?? base.escortId };
  if (type === "control")
    return { ...base, holdRounds: draft.holdRounds ?? base.holdRounds };
  if (type === "survival")
    return { ...base, roundLimit: draft.roundLimit ?? base.roundLimit };
  return base;
}

/** 部署阶段表单校验，返回错误信息；合法返回 null */
export function validateMission(
  cfg: MissionConfig,
  b: Pick<Battle, "units" | "tiles">,
): string | null {
  if (cfg.type === "escort") {
    if (!cfg.exit?.length) return "请在地图上绘制至少一个出口格";
    if (!b.units.some((u) => u.id === cfg.escortId && u.team === "azure"))
      return "请选择有效的苍蓝军护送目标";
    if (
      b.tiles.some(
        (t) => t.terrain === "wall" && inZone(cfg.exit, t.x, t.y),
      )
    )
      return "出口不能包含断崖格";
  }
  if (cfg.type === "control") {
    if (!cfg.zone?.length) return "请在地图上绘制至少一个占点格";
    if (
      b.tiles.some(
        (t) => t.terrain === "wall" && inZone(cfg.zone, t.x, t.y),
      )
    )
      return "占点区域不能包含断崖格";
    if (!cfg.holdRounds || cfg.holdRounds < 1) return "占点回合数至少为 1";
  }
  if (cfg.type === "survival") {
    if (!cfg.roundLimit || cfg.roundLimit < 1) return "回合上限至少为 1";
  }
  return null;
}

export interface MissionProgress {
  /** 0-100 主进度 */
  percent: number;
  /** 主进度文字 */
  text: string;
  /** 附加说明 */
  detail: string;
}

function end(b: Battle, winner: string, reason: string) {
  b.ended = winner;
  b.endReason = reason;
}

export interface SettleContext {
  /** 单位结束行动（含持续伤害 tick）后的完整结算 */
  turnEnd?: boolean;
  /** 本次结算跨越了回合边界（新回合开始） */
  roundAdvanced?: boolean;
}

/**
 * 唯一的任务结算入口。移动落点、技能结算、回合推进都调用本函数，
 * 保证同一任务状态在所有行动路径下一致推进。
 */
export function settleMission(b: Battle, ctx: SettleContext | boolean = {}) {
  const meta: SettleContext =
    typeof ctx === "boolean" ? { roundAdvanced: ctx } : ctx;
  if (b.ended) return;
  const cfg = normalizeMission(b.mission, b);
  if (cfg.type !== b.mission.type) b.mission = cfg;
  const state = b.missionState ?? createMissionState();
  b.missionState = state;

  const alive = living(b);
  const azureAlive = alive.some((u) => u.team === "azure");
  const emberAlive = alive.some((u) => u.team === "ember");
  const teamWinner = !azureAlive
    ? "ember"
    : !emberAlive
      ? "azure"
      : null;

  if (cfg.type === "annihilation") {
    if (teamWinner)
      end(
        b,
        teamWinner,
        teamWinner === "azure" ? "敌方已全部歼灭" : "苍蓝军全军覆没",
      );
    return;
  }

  // 苍蓝军全灭：任何任务都直接失败（失败优先于成功）
  if (!azureAlive) {
    end(b, "ember", "苍蓝军全军覆没，任务失败");
    return;
  }

  if (cfg.type === "escort") {
    const target = b.units.find((u) => u.id === cfg.escortId);
    // 护送目标被击倒即任务失败（失败优先于抵达出口的成功条件）
    if (!target || target.hp <= 0) {
      end(b, "ember", `护送目标${target?.name ?? ""}已被击倒，任务失败`);
      return;
    }
    const standing = inZone(cfg.exit, target.x, target.y);
    if (meta.turnEnd) {
      // 仅在一次行动完整结算后（含持续伤害 tick）确认抵达，
      // 同一步到达出口又被灼烧击倒时，以完整结算后的存活结果为准
      if (standing) {
        state.reachedExit = true;
        end(b, "azure", `护送目标${target.name}已存活抵达出口`);
        return;
      }
      state.reachedExit = false;
    } else {
      // 移动落点 / 技能中途只更新进度标记，不触发胜负
      state.reachedExit = standing;
    }
    // 非歼灭任务下敌方全灭不自动获胜，仍需完成护送
    return;
  }

  if (cfg.type === "control") {
    if (meta.roundAdvanced) {
      const occupied = b.units.some(
        (u) =>
          u.hp > 0 &&
          u.team === "azure" &&
          inZone(cfg.zone, u.x, u.y),
      );
      if (occupied) {
        state.hold += 1;
        if (state.hold >= (cfg.holdRounds ?? 3)) {
          end(b, "azure", `已连续占据目标区域 ${state.hold} 回合`);
          return;
        }
      } else {
        state.hold = 0;
      }
    }
    return;
  }

  if (cfg.type === "survival") {
    const limit = cfg.roundLimit ?? 6;
    // 进入第 limit 回合即视为撑过前面的 limit-1 回合
    if (meta.turnEnd && b.round >= limit) {
      end(b, "azure", `苍蓝军存活至第 ${limit} 回合，任务成功`);
      return;
    }
    return;
  }
}

export function missionProgress(b: Battle): MissionProgress {
  const cfg = normalizeMission(b.mission, b);
  const state = b.missionState ?? createMissionState();
  switch (cfg.type) {
    case "escort": {
      const target = b.units.find((u) => u.id === cfg.escortId);
      const alive = !!target && target.hp > 0;
      const standing =
        alive && inZone(cfg.exit, target!.x, target!.y);
      return {
        percent: standing ? 100 : alive ? 45 : 0,
        text: standing ? "已抵达出口" : alive ? "护送进行中" : "目标阵亡",
        detail: alive
          ? `目标：${target!.name} · ${state.reachedExit ? "位于出口" : "尚未抵达出口"}`
          : `护送目标${target?.name ?? ""}已被击倒`,
      };
    }
    case "control": {
      const need = cfg.holdRounds ?? 3;
      const hold = Math.min(state.hold, need);
      const occupied = b.units.some(
        (u) => u.hp > 0 && u.team === "azure" && inZone(cfg.zone, u.x, u.y),
      );
      return {
        percent: Math.round((hold / need) * 100),
        text: `连续占点 ${hold}/${need} 回合`,
        detail: occupied ? "本回合区域内有我方单位" : "当前区域无我方单位",
      };
    }
    case "survival": {
      const limit = cfg.roundLimit ?? 6;
      const remain = Math.max(0, limit - b.round);
      return {
        percent: Math.min(100, Math.round(((b.round - 1) / limit) * 100)),
        text: remain > 0 ? `剩余 ${remain} 回合` : "生存达成",
        detail: `第 ${b.round} 回合 / 上限 ${limit} 回合`,
      };
    }
    default: {
      const total = b.units.length;
      const emberTotal = b.units.filter((u) => u.team === "ember").length;
      const emberDead = b.units.filter(
        (u) => u.team === "ember" && u.hp <= 0,
      ).length;
      return {
        percent: emberTotal ? Math.round((emberDead / emberTotal) * 100) : 100,
        text: `击破 ${emberDead}/${emberTotal}`,
        detail: `场上存活 ${living(b).length}/${total} 人`,
      };
    }
  }
}

/** 生存任务剩余回合（行动顺序条使用），非生存任务返回 null */
export function roundsLeft(b: Battle): number | null {
  const cfg = normalizeMission(b.mission, b);
  if (cfg.type !== "survival") return null;
  return Math.max(0, (cfg.roundLimit ?? 6) - b.round);
}
