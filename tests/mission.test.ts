/* 任务结算逻辑验证：通过 esbuild 打包后由 Node 运行 */
import assert from "node:assert/strict";
import type { Battle, MissionConfig, Point, Unit } from "../src/shared/types";
import { createMap } from "../src/features/terrain/model/map";
import { createUnits } from "../src/features/roster/model/units";
import { order } from "../src/features/initiative/lib/order";
import {
  createMissionState,
  settleMission,
  normalizeMission,
  validateMission,
  defaultMission,
} from "../src/features/mission/model/mission";
import { finishTurn } from "../src/features/initiative/model/turns";
import { tickStatuses } from "../src/features/roster/lib/status";
import { migrateForTest } from "./archive-helper";

function makeBattle(mission: MissionConfig): Battle {
  const b: Battle = {
    tiles: createMap(),
    units: createUnits(),
    round: 1,
    queue: [],
    active: "",
    ended: null,
    mission,
    missionState: createMissionState(),
    endReason: null,
  };
  b.queue = order(b);
  b.active = b.queue[0];
  return b;
}
const find = (b: Battle, id: string) => b.units.find((u) => u.id === id)!;
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

/* ---------- 歼灭：默认任务，全灭判定 ---------- */
check("歼灭任务：敌方全灭，苍蓝获胜", () => {
  const b = makeBattle({ type: "annihilation" });
  for (const u of b.units) if (u.team === "ember") u.hp = 0;
  settleMission(b, {});
  assert.equal(b.ended, "azure");
  assert.match(b.endReason!, /歼灭/);
});
check("歼灭任务：苍蓝全灭，余烬获胜", () => {
  const b = makeBattle({ type: "annihilation" });
  for (const u of b.units) if (u.team === "azure") u.hp = 0;
  settleMission(b, {});
  assert.equal(b.ended, "ember");
});

/* ---------- 护送 ---------- */
const escortCfg = (b: Battle): MissionConfig => {
  const c = defaultMission("escort", b);
  // 出口设为护送目标当前相邻格，便于测试
  const t = find(b, c.escortId!);
  c.exit = [{ x: t.x + 1, y: t.y }];
  return c;
};
check("护送：移动落点到出口当步不立即获胜，结束行动完整结算后才获胜", () => {
  const b = makeBattle(escortCfg(makeBattle({ type: "annihilation" })));
  const t = find(b, b.mission.escortId!);
  const exit = b.mission.exit![0];
  Object.assign(t, exit);
  settleMission(b, {}); // 移动落点
  assert.equal(b.ended, null, "落点当步不应结束");
  assert.equal(b.missionState.reachedExit, true);
  finishTurn(b, tickStatuses); // 完整结算（无 burn，存活）
  assert.equal(b.ended, "azure");
  assert.match(b.endReason!, /抵达出口/);
});
check("护送：同一步抵达出口又被持续伤害击倒，以存活结果为准 → 失败优先", () => {
  const base = makeBattle({ type: "annihilation" });
  const b = makeBattle(escortCfg(base));
  const t = find(b, b.mission.escortId!);
  // 护送目标本人行动：移动落点到出口，结束行动时灼烧 tick 将其击倒
  b.active = t.id;
  Object.assign(t, b.mission.exit![0]);
  t.statuses.push({ kind: "burn", turns: 1 });
  t.hp = 2; // burn 造成 3 点 → 倒下
  settleMission(b, {});
  assert.equal(b.ended, null, "落点当步先不判定");
  assert.equal(b.missionState.reachedExit, true, "落点瞬间位于出口");
  finishTurn(b, tickStatuses);
  assert.equal(t.hp, 0);
  assert.equal(b.ended, "ember", "完整结算后目标阵亡，失败优先于抵达成功");
  assert.match(b.endReason!, /全军覆没|失败/);
});
check("护送：目标阵亡立即失败，即使敌方同时全灭也优先失败", () => {
  const base = makeBattle({ type: "annihilation" });
  const b = makeBattle(escortCfg(base));
  const t = find(b, b.mission.escortId!);
  t.hp = 0;
  for (const u of b.units) if (u.team === "ember") u.hp = 0;
  settleMission(b, {});
  assert.equal(b.ended, "ember", "失败条件优先于成功");
});
check("护送：非歼灭任务下敌方全灭不自动获胜", () => {
  const base = makeBattle({ type: "annihilation" });
  const b = makeBattle(escortCfg(base));
  for (const u of b.units) if (u.team === "ember") u.hp = 0;
  settleMission(b, {});
  assert.equal(b.ended, null);
});

/* ---------- 占点 ---------- */
function controlBattle(holdRounds = 3): Battle {
  const b = makeBattle(defaultMission("control", makeBattle({ type: "annihilation" })));
  b.mission.holdRounds = holdRounds;
  return b;
}
check("占点：连续 holdRounds 个回合结束时区域内有我方才获胜", () => {
  const b = controlBattle(2);
  const zone = b.mission.zone!;
  const azure = b.units.find((u) => u.team === "azure")!;
  Object.assign(azure, zone[0]);
  finishTurn(b, tickStatuses); // 推进（不一定换轮）
  // 连续结束若干次行动直到跨轮
  let guard = 0;
  while (!b.ended && guard++ < 30) finishTurn(b, tickStatuses);
  assert.equal(b.ended, "azure");
  assert.ok(b.missionState.hold >= 2);
});
check("占点：区域内无我方时连续计数清零", () => {
  const b = controlBattle(3);
  const zone: Point[] = b.mission.zone!;
  // 确保没有任何单位在区域内
  for (const u of b.units)
    if (zone.some((z) => z.x === u.x && z.y === u.y)) u.x = u.x === 0 ? 1 : 0;
  const before = b.missionState.hold;
  // 强制跨一个完整回合
  let guard = 0;
  const startRound = b.round;
  while (b.round === startRound && guard++ < 30) finishTurn(b, tickStatuses);
  assert.equal(b.missionState.hold, 0);
  assert.equal(before, 0);
  assert.equal(b.ended, null);
});

/* ---------- 生存 ---------- */
check("生存：到达回合上限后结束行动即成功", () => {
  const b = makeBattle({ type: "survival", roundLimit: 3 });
  b.round = 3;
  settleMission(b, { turnEnd: true });
  assert.equal(b.ended, "azure");
  assert.match(b.endReason!, /存活/);
});
check("生存：到达回合数字但行动中途不触发，须等完整结算", () => {
  const b = makeBattle({ type: "survival", roundLimit: 3 });
  b.round = 3;
  settleMission(b, {});
  assert.equal(b.ended, null);
});
check("生存：未到上限不结束，苍蓝全灭则失败", () => {
  const b = makeBattle({ type: "survival", roundLimit: 8 });
  b.round = 2;
  settleMission(b, { turnEnd: true });
  assert.equal(b.ended, null);
  for (const u of b.units) if (u.team === "azure") u.hp = 0;
  settleMission(b, {});
  assert.equal(b.ended, "ember");
});

/* ---------- 配置校验与损坏归一化 ---------- */
check("损坏任务配置归一化为歼灭，不抛异常", () => {
  const b = makeBattle({ type: "annihilation" });
  assert.deepEqual(normalizeMission(null, b), { type: "annihilation" });
  assert.deepEqual(normalizeMission({ type: "escort" }, b).type, "annihilation");
  assert.deepEqual(
    normalizeMission({ type: "escort", exit: [] }, b).type,
    "annihilation",
  );
  assert.deepEqual(
    normalizeMission({ type: "control", zone: [{ x: 200, y: -3 }] }, b)
      .type,
    "annihilation",
  );
  assert.deepEqual(
    normalizeMission({ type: "survival", roundLimit: 0 }, b).type,
    "annihilation",
  );
  assert.deepEqual(normalizeMission("junk", b), { type: "annihilation" });
});
check("护送配置缺少有效护送单位时校验失败", () => {
  const b = makeBattle({ type: "annihilation" });
  const bad: MissionConfig = {
    type: "escort",
    escortId: "ghost",
    exit: [{ x: 1, y: 1 }],
  };
  assert.ok(validateMission(bad, b));
});
check("区域包含断崖格时校验失败", () => {
  const b = makeBattle({ type: "annihilation" });
  // (5,6) 在默认地图为 wall
  const cfg: MissionConfig = { type: "control", zone: [{ x: 5, y: 6 }], holdRounds: 2 };
  assert.ok(validateMission(cfg, b));
});

/* ---------- 存档迁移：旧战斗自动歼灭 ---------- */
check("旧存档（无 mission 字段）迁移为歼灭任务，事件快照同样补齐", () => {
  const old = makeBattle({ type: "annihilation" });
  delete (old as Partial<Battle>).mission;
  delete (old as Partial<Battle>).missionState;
  delete (old as Partial<Battle>).endReason;
  const session = {
    initial: JSON.parse(JSON.stringify(old)),
    live: JSON.parse(JSON.stringify(old)),
    events: [
      {
        id: 1,
        kind: "wait",
        actor: old.active,
        label: "x",
        path: [],
        before: JSON.parse(JSON.stringify(old)),
        after: JSON.parse(JSON.stringify(old)),
      },
    ],
  };
  const migrated = migrateForTest(session);
  assert.equal(migrated.live.mission.type, "annihilation");
  assert.ok(migrated.live.missionState);
  assert.equal(migrated.events[0].after.mission.type, "annihilation");
  assert.equal(migrated.events[0].after.endReason, null);
});

/* ---------- 回放一致性：结算结果写入快照 ---------- */
check("任务状态随战斗快照变化，回放帧可还原当时进度", () => {
  const b = makeBattle({ type: "survival", roundLimit: 4 });
  const snapshot1 = JSON.parse(JSON.stringify(b));
  b.round = 4;
  settleMission(b, { turnEnd: true });
  assert.equal(b.ended, "azure");
  assert.equal(snapshot1.ended, null, "旧快照不受后续结算影响");
  assert.equal(snapshot1.round, 1);
});

console.log(`\n全部 ${passed} 项测试通过`);
