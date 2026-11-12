import type { Battle, Session } from "../../../shared/types";
import { assertBattle } from "../../../shared/document";
import {
  createMissionState,
  normalizeMission,
} from "../../mission/model/mission";

const STORAGE_KEY = "we001-session";

/**
 * 为战斗快照补齐任务字段。
 * 旧战斗（无 mission 字段）自动使用歼灭任务；损坏的任务配置归一化，
 * 仅在内存中修正，不回写覆盖 localStorage 中的原存档。
 */
function migrateBattle(b: Battle): Battle {
  let mission: Battle["mission"];
  try {
    mission = normalizeMission((b as Partial<Battle>).mission, b);
  } catch {
    mission = { type: "annihilation" };
  }
  b.mission = mission;
  b.missionState =
    (b as Partial<Battle>).missionState &&
    typeof (b as Partial<Battle>).missionState === "object"
      ? {
          reachedExit:
            !!(b.missionState as { reachedExit?: unknown }).reachedExit,
          hold: Number(
            (b.missionState as { hold?: unknown }).hold,
          ) || 0,
        }
      : createMissionState();
  b.endReason =
    typeof (b as Partial<Battle>).endReason === "string"
      ? (b.endReason as string)
      : null;
  return b;
}

/**
 * 保存前完整校验。任何异常都向上抛出，由调用方提示，
 * 绝不写入残缺数据覆盖原有存档。
 */
export function saveArchive(s: Session) {
  assertBattle(s.live);
  assertBattle(s.initial);
  if (!Array.isArray(s.events)) throw new Error("行动记录不完整");
  // 归一化校验任务配置：损坏配置无法通过时直接拒绝保存
  normalizeMission(s.live.mission, s.live);
  if (!s.live.missionState) throw new Error("任务进度缺失");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadArchive(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    assertBattle(s.live);
    assertBattle(s.initial);
    if (!Array.isArray(s.events)) return null;
    migrateBattle(s.live);
    migrateBattle(s.initial);
    // 历史快照同样补齐任务字段，保证回放任一步都能还原进度
    for (const e of s.events) {
      migrateBattle(e.before);
      migrateBattle(e.after);
    }
    return s;
  } catch {
    return null;
  }
}

export function downloadArchive(s: Session) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "灰烬渡口-战斗记录.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
