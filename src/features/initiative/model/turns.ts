import type { Battle } from "../../../shared/types";
import { findUnit } from "../../../shared/document";
import { order } from "../lib/order";
import { settleMission } from "../../mission/model/mission";
export function finishTurn(
  b: Battle,
  tick: (u: ReturnType<typeof findUnit>) => void,
) {
  tick(findUnit(b, b.active));
  b.queue = b.queue.filter((id) => id !== b.active && findUnit(b, id).hp > 0);
  let roundAdvanced = false;
  if (!b.queue.length) {
    b.round++;
    roundAdvanced = true;
    b.queue = order(b);
    for (const u of b.units) {
      u.moved = false;
      u.acted = false;
    }
  }
  b.active = b.queue[0] ?? b.active;
  // 结束行动（含持续伤害结算）与回合推进都驱动同一任务状态
  settleMission(b, { turnEnd: true, roundAdvanced });
}
