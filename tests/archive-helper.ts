import type { Battle, Session } from "../src/shared/types";
import {
  createMissionState,
  normalizeMission,
} from "../src/features/mission/model/mission";

/** 与 replay/lib/archive.ts 中 migrateBattle 保持一致的纯逻辑版本 */
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
          hold: Number((b.missionState as { hold?: unknown }).hold) || 0,
        }
      : createMissionState();
  b.endReason =
    typeof (b as Partial<Battle>).endReason === "string"
      ? (b.endReason as string)
      : null;
  return b;
}

export function migrateForTest(s: Session): Session {
  migrateBattle(s.live);
  migrateBattle(s.initial);
  for (const e of s.events) {
    migrateBattle(e.before);
    migrateBattle(e.after);
  }
  return s;
}
