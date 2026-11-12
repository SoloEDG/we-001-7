export type Terrain = "plain" | "forest" | "water" | "ridge" | "wall";
export type Profession = "guard" | "ranger" | "mage" | "medic";
export interface Point {
  x: number;
  y: number;
}
export interface Tile extends Point {
  terrain: Terrain;
}
export interface Status {
  kind: "slow" | "burn" | "guard";
  turns: number;
}
export interface Unit extends Point {
  id: string;
  name: string;
  job: Profession;
  team: "azure" | "ember";
  hp: number;
  maxHp: number;
  power: number;
  armor: number;
  speed: number;
  move: number;
  statuses: Status[];
  moved: boolean;
  acted: boolean;
}
export type MissionType = "annihilation" | "escort" | "control" | "survival";
export interface MissionConfig {
  type: MissionType;
  /** 护送：护送目标单位 id */
  escortId?: string;
  /** 护送：出口区域格 */
  exit?: Point[];
  /** 占点：目标区域格 */
  zone?: Point[];
  /** 占点：需要持续占点的回合数 */
  holdRounds?: number;
  /** 生存：回合上限（进入该回合即完成） */
  roundLimit?: number;
}
export interface MissionState {
  /** 护送：目标上一步结算后是否位于出口 */
  reachedExit: boolean;
  /** 占点：已连续占点回合数 */
  hold: number;
}
export interface Battle {
  tiles: Tile[];
  units: Unit[];
  round: number;
  queue: string[];
  active: string;
  ended: string | null;
  /** 任务配置（随快照持久化，决定胜负判定） */
  mission: MissionConfig;
  /** 任务运行时进度（随快照持久化，回放可还原） */
  missionState: MissionState;
  /** 胜负原因，结算时写入，回放任意步可见 */
  endReason: string | null;
}
export type EventKind = "move" | "skill" | "wait" | "terrain";
export interface BattleEvent {
  id: number;
  kind: EventKind;
  actor: string;
  label: string;
  path: Point[];
  before: Battle;
  after: Battle;
}
export interface Session {
  initial: Battle;
  live: Battle;
  events: BattleEvent[];
}
export interface Skill {
  id: string;
  name: string;
  range: number;
  power: number;
  target: "enemy" | "ally" | "self";
  status?: Status["kind"];
  description: string;
}
