import type { Battle } from "../../../shared/types";
import { roundsLeft } from "../../mission/model/mission";
export function turnProgress(b: Battle) {
  const alive = b.units.filter((u) => u.hp > 0).length;
  return alive ? Math.round(((alive - b.queue.length) / alive) * 100) : 100;
}
export function turnLabel(b: Battle) {
  if (b.ended) {
    const winner =
      b.ended === "azure" ? "苍蓝军" : b.ended === "ember" ? "余烬军" : "平局";
    return `${winner}获胜 · ${b.endReason ?? "战斗结束"}`;
  }
  const left = roundsLeft(b);
  const suffix = left === null ? "" : ` · 剩余 ${left} 回合`;
  return `第 ${b.round} 回合 · ${b.queue.length} 人待行动${suffix}`;
}
