import {
  BALL_R,
  INNER_RAIL_END_DEG,
  INNER_RAIL_IN,
  NAIL_R,
  RAIL_START_DEG,
  type BoardLayout,
  type Segment,
  type Sensor,
} from "./board";

/**
 * 盤面の2D物理。盤面とガラスの間を転がる玉は実質2次元なので、
 * 計算は平面で行い、描画だけを3Dにする。
 */

export const GRAVITY = 3300; // mm/s^2（盤面の傾きと転がりを含めた実効値）
/** 速度の目安の倍率。重力を変えても玉の軌跡が変わらないよう、速度の定数はこれを掛けて使う */
const V = Math.sqrt(GRAVITY / 1650);
export const STEP = 1 / 1200;
const NAIL_RESTITUTION = 0.6;
const BALL_RESTITUTION = 0.55;
/** 接触の摩擦係数。法線方向に受けた力積に比例して接線方向の速度を削る */
const NAIL_FRICTION = 0.12;
const SEGMENT_FRICTION = 0.08;
const RAIL_FRICTION = 0.9994;
const MAX_BALLS = 64;
const STAGE_MAX_TIME = 3.2;
/** ステージ中央の穴の上にいる間の吸い込み率 [1/s] */
const CENTER_CAPTURE_RATE = 10;

export type BallLayer = "board" | "stage";

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  layer: BallLayer;
  /** 発射通路にいる間 true（ここから落ちるとファール） */
  inChannel: boolean;
  age: number;
  stageTime: number;
  slowTime: number;
  /** ワープ通過中は非表示・非衝突 */
  hiddenUntil: number;
  /** 描画用の転がり角 */
  spin: number;
  passedGate: boolean;
  stallTime: number;
  stalls: number;
}

const OUT_SENSOR: Sensor = { id: "out", kind: "out", x0: 0, y0: 0, x1: 0, y1: 0 };

export type PhysicsEvent =
  | { type: "sensor"; sensor: Sensor; ball: Ball }
  | { type: "foul"; ball: Ball }
  | { type: "nail"; x: number; y: number; speed: number }
  | { type: "stage-drop"; ball: Ball; center: boolean };

interface Grid {
  cell: number;
  min: number;
  cols: number;
  nailCells: number[][];
  segCells: number[][];
}

function buildGrid(layout: BoardLayout, cell = 20, min = -250, max = 250): Grid {
  const cols = Math.ceil((max - min) / cell);
  const nailCells: number[][] = Array.from({ length: cols * cols }, () => []);
  const segCells: number[][] = Array.from({ length: cols * cols }, () => []);
  const idx = (cx: number, cy: number) => cy * cols + cx;
  const clampC = (v: number) => Math.max(0, Math.min(cols - 1, Math.floor((v - min) / cell)));
  layout.nails.forEach((n, i) => {
    nailCells[idx(clampC(n.x), clampC(n.y))].push(i);
  });
  layout.segments.forEach((s, i) => {
    const pad = BALL_R + 1;
    const x0 = clampC(Math.min(s.a.x, s.b.x) - pad);
    const x1 = clampC(Math.max(s.a.x, s.b.x) + pad);
    const y0 = clampC(Math.min(s.a.y, s.b.y) - pad);
    const y1 = clampC(Math.max(s.a.y, s.b.y) + pad);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) segCells[idx(cx, cy)].push(i);
  });
  return { cell, min, cols, nailCells, segCells };
}

export interface GimmickState {
  denchu: boolean;
  attacker: boolean;
}

/**
 * 法線 (nx, ny) の面で玉を跳ね返す。vn は面に向かう速度（負）。
 * 摩擦は受けた力積に比例させる（クーロン摩擦）ので、転がっている玉はほとんど減速しない。
 */
function bounce(b: Ball, nx: number, ny: number, vn: number, restitution: number, mu: number): void {
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const dvn = -vn * (1 + restitution);
  const nvt = Math.sign(vt) * Math.max(0, Math.abs(vt) - mu * dvn);
  const nvn = -vn * restitution;
  b.vx = nx * nvn + tx * nvt;
  b.vy = ny * nvn + ty * nvt;
}

export class PhysicsWorld {
  readonly layout: BoardLayout;
  balls: Ball[] = [];
  gimmicks: GimmickState = { denchu: false, attacker: false };
  windmillAngle: number[];
  windmillOmega: number[];
  time = 0;
  private nextId = 1;
  private grid: Grid;
  private rand: () => number;
  private events: PhysicsEvent[] = [];

  constructor(layout: BoardLayout, rand: () => number = Math.random) {
    this.layout = layout;
    this.grid = buildGrid(layout);
    this.rand = rand;
    this.windmillAngle = layout.windmills.map(() => 0);
    this.windmillOmega = layout.windmills.map(() => 0);
  }

  get count(): number {
    return this.balls.length;
  }

  /** strength: 0..1（ハンドルの回し具合） */
  launch(strength: number): Ball | null {
    if (this.balls.length >= MAX_BALLS) return null;
    const { launch } = this.layout;
    const s = Math.max(0, Math.min(1, strength));
    // ハンドルには個体差のぶれがある（実機の発射も毎回わずかに揺れる）
    const speed = (720 + s * 900) * V * (1 + (this.rand() - 0.5) * 0.024);
    const ball: Ball = {
      id: this.nextId++,
      x: launch.x,
      y: launch.y,
      vx: launch.dirX * speed,
      vy: launch.dirY * speed,
      layer: "board",
      inChannel: true,
      age: 0,
      stageTime: 0,
      slowTime: 0,
      hiddenUntil: 0,
      spin: 0,
      passedGate: false,
      stallTime: 0,
      stalls: 0,
    };
    this.balls.push(ball);
    return ball;
  }

  /** dt 秒ぶん進める。発生したイベントを返す */
  advance(dt: number): PhysicsEvent[] {
    this.events = [];
    const steps = Math.max(1, Math.round(dt / STEP));
    for (let i = 0; i < steps; i++) this.step(STEP);
    return this.events;
  }

  private step(h: number): void {
    this.time += h;
    // 風車は空気抵抗で少しずつ止まる
    for (let w = 0; w < this.windmillOmega.length; w++) {
      this.windmillOmega[w] *= 0.9995;
      this.windmillAngle[w] += this.windmillOmega[w] * h;
    }

    const removed = new Set<number>();
    for (const b of this.balls) {
      if (b.hiddenUntil > this.time) continue;
      b.age += h;
      b.vy -= GRAVITY * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy);
      b.spin += (sp * h) / BALL_R;

      if (b.layer === "stage") {
        this.collideSegments(b, "stage");
        this.updateStage(b, h);
        continue;
      }

      if (this.unstick(b, sp, h)) {
        this.events.push({ type: "sensor", sensor: OUT_SENSOR, ball: b });
        removed.add(b.id);
        continue;
      }
      this.collideBands(b);
      this.collideNails(b);
      this.collideSegments(b, "board");
      this.collideGimmicks(b);
      this.collideWindmills(b);
      if (this.updateChannel(b) || this.checkSensors(b)) removed.add(b.id);
    }

    this.collideBalls();

    if (removed.size > 0) this.balls = this.balls.filter((b) => !removed.has(b.id));
  }

  /**
   * 釘の間や壁際で玉が静止しないようにする。実機では台の振動と後続の玉で
   * 玉が止まり続けることはないので、遅い状態が続いたら揺らす。揺らしても
   * 抜けない玉はアウト扱いにする（戻り値 true）。
   */
  private unstick(b: Ball, speed: number, h: number): boolean {
    b.stallTime = speed < 25 * V ? b.stallTime + h : 0;
    if (b.stallTime > 0.25) {
      b.stalls++;
      const k = 1 + b.stalls;
      b.vx += (this.rand() - 0.5) * 120 * V * k;
      b.vy += (30 + this.rand() * 40) * V * k;
      b.stallTime = 0;
    }
    return b.stalls > 10 || b.age > 25;
  }

  /** ファールで消える玉なら true */
  private updateChannel(b: Ball): boolean {
    if (!b.inChannel) return false;
    const r = Math.hypot(b.x, b.y);
    let th = (Math.atan2(b.y, b.x) * 180) / Math.PI;
    if (th < -90) th += 360;
    if (r < INNER_RAIL_IN - 1 || th < INNER_RAIL_END_DEG - 2) b.inChannel = false;
    // 勢いが足りず発射位置より下へ戻ったらファール
    if (b.inChannel && th > RAIL_START_DEG + 4 && b.vy < 0) {
      this.events.push({ type: "foul", ball: b });
      return true;
    }
    return false;
  }

  private collideBands(b: Ball): void {
    const r = Math.hypot(b.x, b.y);
    if (r < 1) return;
    let th = (Math.atan2(b.y, b.x) * 180) / Math.PI;
    for (const band of this.layout.bands) {
      let t = th;
      while (t < band.fromDeg) t += 360;
      while (t > band.fromDeg + 360) t -= 360;
      if (t > band.toDeg) continue;
      if (r <= band.ra - BALL_R || r >= band.rb + BALL_R) continue;
      const nx = b.x / r;
      const ny = b.y / r;
      const mid = (band.ra + band.rb) / 2;
      const target = r < mid ? band.ra - BALL_R : band.rb + BALL_R;
      const sign = r < mid ? -1 : 1; // 押し出す向き（-1: 内側へ）
      b.x = nx * target;
      b.y = ny * target;
      const vn = b.vx * nx + b.vy * ny;
      if (vn * sign < 0) {
        // レールに沿って走る玉はほとんど跳ねない
        const e = 0.15;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        b.vx *= RAIL_FRICTION;
        b.vy *= RAIL_FRICTION;
      }
    }
  }

  private collideNails(b: Ball): void {
    const g = this.grid;
    const cx = Math.floor((b.x - g.min) / g.cell);
    const cy = Math.floor((b.y - g.min) / g.cell);
    const minDist = BALL_R + NAIL_R;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.cols) continue;
        for (const ni of g.nailCells[y * g.cols + x]) {
          const n = this.layout.nails[ni];
          const ox = b.x - n.x;
          const oy = b.y - n.y;
          const d2 = ox * ox + oy * oy;
          if (d2 >= minDist * minDist || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          const nx = ox / d;
          const ny = oy / d;
          b.x = n.x + nx * minDist;
          b.y = n.y + ny * minDist;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            bounce(b, nx, ny, vn, NAIL_RESTITUTION, NAIL_FRICTION);
            if (-vn > 120 * V) this.events.push({ type: "nail", x: n.x, y: n.y, speed: -vn });
          }
        }
      }
    }
  }

  private resolveSegment(b: Ball, s: Segment): void {
    const abx = s.b.x - s.a.x;
    const aby = s.b.y - s.a.y;
    const len2 = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, ((b.x - s.a.x) * abx + (b.y - s.a.y) * aby) / len2));
    const px = s.a.x + abx * t;
    const py = s.a.y + aby * t;
    const ox = b.x - px;
    const oy = b.y - py;
    const d2 = ox * ox + oy * oy;
    if (d2 >= BALL_R * BALL_R || d2 < 1e-12) return;
    if (s.oneWay && (b.x - s.a.x) * s.oneWay.x + (b.y - s.a.y) * s.oneWay.y < 0) return;
    const d = Math.sqrt(d2);
    const nx = ox / d;
    const ny = oy / d;
    b.x = px + nx * BALL_R;
    b.y = py + ny * BALL_R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) bounce(b, nx, ny, vn, s.restitution, SEGMENT_FRICTION);
  }

  private collideSegments(b: Ball, layer: Segment["layer"]): void {
    const g = this.grid;
    const cx = Math.max(0, Math.min(g.cols - 1, Math.floor((b.x - g.min) / g.cell)));
    const cy = Math.max(0, Math.min(g.cols - 1, Math.floor((b.y - g.min) / g.cell)));
    for (const si of g.segCells[cy * g.cols + cx]) {
      const s = this.layout.segments[si];
      if (layer === "board" && s.layer === "stage") continue;
      this.resolveSegment(b, s);
    }
  }

  private collideGimmicks(b: Ball): void {
    for (const gm of this.layout.gimmicks) {
      const open = this.gimmicks[gm.id];
      for (const s of open ? gm.whenOpen : gm.whenClosed) this.resolveSegment(b, s);
    }
  }

  private collideWindmills(b: Ball): void {
    this.layout.windmills.forEach((w, i) => {
      const ox = b.x - w.x;
      const oy = b.y - w.y;
      const d = Math.hypot(ox, oy);
      const minDist = w.r + BALL_R;
      if (d >= minDist || d < 1e-6) return;
      const nx = ox / d;
      const ny = oy / d;
      b.x = w.x + nx * minDist;
      b.y = w.y + ny * minDist;
      const vn = b.vx * nx + b.vy * ny;
      const tx = -ny;
      const ty = nx;
      if (vn < 0) {
        b.vx -= 1.4 * vn * nx;
        b.vy -= 1.4 * vn * ny;
      }
      // 風車の羽根と玉の間で接線方向の速度をやりとりする
      const surface = this.windmillOmega[i] * w.r;
      const vt = b.vx * tx + b.vy * ty;
      const rel = vt - surface;
      const k = 0.35;
      b.vx -= tx * rel * k;
      b.vy -= ty * rel * k;
      this.windmillOmega[i] += (rel * k * 0.6) / w.r;
    });
  }

  private updateStage(b: Ball, h: number): void {
    b.stageTime += h;
    const hole = this.layout.stageCenterHole;
    const speed = Math.hypot(b.vx, b.vy);
    // 中央の穴の上を通る間、遅い玉ほど穴に吸い込まれやすい（実機の「ステージ中央から落ちる」）
    const inHole = b.x > hole.x0 && b.x < hole.x1;
    if (b.y < hole.y - 2 && inHole) {
      this.dropFromStage(b, true);
      return;
    }
    if (inHole && this.rand() < 1 - Math.exp(-CENTER_CAPTURE_RATE * h)) {
      this.dropFromStage(b, true);
      return;
    }
    b.slowTime = speed < 40 * V ? b.slowTime + h : 0;
    // 実機ではステージの手前から零れる。止まりかけるか一定時間で前へ落とす
    if (b.slowTime > 0.35 || b.stageTime > STAGE_MAX_TIME) this.dropFromStage(b, false);
  }

  private dropFromStage(b: Ball, center: boolean): void {
    this.events.push({ type: "stage-drop", ball: b, center });
    b.layer = "board";
    b.hiddenUntil = this.time + (center ? 0.06 : 0.12);
    if (center) {
      b.x = (this.rand() - 0.5) * 14;
      b.y = -80;
      b.vx = (this.rand() - 0.5) * 240 * V;
      b.vy = -60 * V;
    } else {
      b.y = -80;
      b.vx = (this.rand() - 0.5) * 60 * V;
      b.vy = -40 * V;
    }
  }

  private checkSensors(b: Ball): boolean {
    for (const s of this.layout.sensors) {
      if (b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue;
      if (s.kind === "denchu" && !this.gimmicks.denchu) continue;
      if (s.kind === "attacker" && !this.gimmicks.attacker) continue;
      if (s.passThrough) {
        if (b.passedGate) continue;
        b.passedGate = true;
        this.events.push({ type: "sensor", sensor: s, ball: b });
        continue;
      }
      if (s.kind === "warp") {
        this.events.push({ type: "sensor", sensor: s, ball: b });
        // ワープの中を通ってステージ左端へ出る
        b.layer = "stage";
        b.inChannel = false;
        b.hiddenUntil = this.time + 0.35;
        b.x = this.layout.warpExit.x;
        b.y = this.layout.warpExit.y;
        b.vx = (90 + this.rand() * 110) * V;
        b.vy = 0;
        b.stageTime = 0;
        b.slowTime = 0;
        return false;
      }
      if (s.kind === "out" && b.inChannel) {
        this.events.push({ type: "foul", ball: b });
        return true;
      }
      this.events.push({ type: "sensor", sensor: s, ball: b });
      return true;
    }
    return false;
  }

  private collideBalls(): void {
    const list = this.balls;
    const minDist = BALL_R * 2;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      // 発射通路の玉は1個ずつしか通らない前提で、他の玉と当てない（戻り球と次の玉が詰まらないように）
      if (a.hiddenUntil > this.time || a.inChannel) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j];
        if (c.hiddenUntil > this.time || c.inChannel || c.layer !== a.layer) continue;
        const ox = c.x - a.x;
        const oy = c.y - a.y;
        const d2 = ox * ox + oy * oy;
        if (d2 >= minDist * minDist || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = ox / d;
        const ny = oy / d;
        const push = (minDist - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        c.x += nx * push;
        c.y += ny * push;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) {
          const j2 = (-(1 + BALL_RESTITUTION) * rel) / 2;
          a.vx -= j2 * nx;
          a.vy -= j2 * ny;
          c.vx += j2 * nx;
          c.vy += j2 * ny;
        }
      }
    }
  }

  /** 描画用: 見えている玉 */
  visibleBalls(): Ball[] {
    return this.balls.filter((b) => b.hiddenUntil <= this.time);
  }
}
