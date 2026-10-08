/**
 * 盤面レイアウト（単位: mm、原点は盤面中央、y は上向き）。
 *
 * 実機の盤面と同じ構成にしている:
 * - 左下から打ち出した玉は外レールと内レールの間を上がり、強さに応じて
 *   左（左打ち）または天井を越えて右（右打ち）に落ちる。
 * - 中央は液晶を囲むセンター役物。左側のワープから入った玉はステージに乗る。
 * - 中央下にヘソ（スタートチャッカー）、右ルートに電チューとアタッカー。
 */

export const BALL_R = 5.5;
export const NAIL_R = 1.0;
export const BOARD_R = 228; // 外レール内側の半径
export const INNER_RAIL_R = 208; // 内レール外側（発射通路側）の半径
export const INNER_RAIL_IN = 205; // 内レール内側（盤面側）の半径
export const RAIL_START_DEG = 232; // 発射位置の角度
export const INNER_RAIL_END_DEG = 148; // 内レールの先端
export const OUTER_RAIL_END_DEG = -38;

export interface Vec {
  x: number;
  y: number;
}

export interface Segment {
  a: Vec;
  b: Vec;
  /** stage: ステージ上の玉だけが当たる */
  layer: "board" | "stage";
  restitution: number;
  /** 片側通行。玉の中心がこの法線の負側にあるときは素通りする */
  oneWay?: Vec;
}

export interface Band {
  /** 中心 (0,0) の円環。ra..rb の帯に玉が入らないようにする */
  ra: number;
  rb: number;
  fromDeg: number;
  toDeg: number;
}

export type SensorKind =
  | "heso"
  | "denchu"
  | "attacker"
  | "gate"
  | "pocket"
  | "warp"
  | "out";

export interface Sensor {
  id: string;
  kind: SensorKind;
  /** 軸平行の矩形（玉の中心が入ったら反応） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 通過のみ（玉を消さない） */
  passThrough?: boolean;
}

export interface Windmill {
  x: number;
  y: number;
  r: number;
}

/** 開閉する部品。closed のときだけ壁になる線分 / open のときだけ壁になる線分 */
export interface Gimmick {
  id: "denchu" | "attacker";
  whenClosed: Segment[];
  whenOpen: Segment[];
}

export interface BoardLayout {
  nails: Vec[];
  /** 見た目だけの釘（物理は下に敷いた線分で受ける） */
  decorNails: Vec[];
  segments: Segment[];
  bands: Band[];
  sensors: Sensor[];
  windmills: Windmill[];
  gimmicks: Gimmick[];
  frame: Vec[];
  stageFloor: Vec[];
  launch: { x: number; y: number; dirX: number; dirY: number };
  warpExit: Vec;
  stageCenterHole: { x0: number; x1: number; y: number };
  heso: Vec;
}

const deg = (d: number) => (d * Math.PI) / 180;

function seg(ax: number, ay: number, bx: number, by: number, restitution = 0.3, layer: Segment["layer"] = "board"): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by }, restitution, layer };
}

function polyline(points: Vec[], restitution = 0.3, layer: Segment["layer"] = "board"): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(seg(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, restitution, layer));
  }
  return out;
}

function nailLine(x0: number, y0: number, x1: number, y1: number, spacing: number): Vec[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / spacing));
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return out;
}

/** 道釘を並べる。gapAfter の番号の釘の後ろだけ間隔を gapSpacing に広げる */
function roadNails(from: Vec, to: Vec, spacing: number, gapAfter: number[], gapSpacing: number): Vec[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const out: Vec[] = [];
  for (let d = 0, i = 0; d <= len + 0.01; i++) {
    out.push({ x: from.x + ux * d, y: from.y + uy * d });
    d += gapAfter.includes(i) ? gapSpacing : spacing;
  }
  return out;
}

function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolygon(p: Vec, poly: Vec[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)));
  }
  return best;
}

/** センター役物の外形（時計回り） */
function buildFrame(): Vec[] {
  const pts: Vec[] = [];
  // 天面: 中央が高い山形。両端 y=95、中央 y=158
  for (let i = 0; i <= 16; i++) {
    const x = -118 + (236 * i) / 16;
    pts.push({ x, y: 95 + 63 * Math.cos((Math.PI * x) / 236) });
  }
  pts.push({ x: 122, y: -40 }, { x: 100, y: -72 }, { x: -100, y: -72 }, { x: -122, y: -40 });
  return pts;
}

/** ステージ床。中央と両端がくぼんだ形で、中央に穴がある */
function buildStageFloor(): { left: Vec[]; right: Vec[] } {
  const f = (x: number) => -64 + 6 * Math.sin((Math.PI * x) / 98) ** 2;
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i <= 14; i++) {
    const x = -101 + ((101 - 6.8) * i) / 14;
    left.push({ x, y: f(x) });
  }
  for (let i = 0; i <= 14; i++) {
    const x = 6.8 + ((101 - 6.8) * i) / 14;
    right.push({ x, y: f(x) });
  }
  return { left, right };
}

export function buildBoard(): BoardLayout {
  const frame = buildFrame();
  const floor = buildStageFloor();
  const segments: Segment[] = [];
  const nails: Vec[] = [];

  // --- センター役物（両面の壁。内側はステージの左右の壁を兼ねる）
  segments.push(...polyline([...frame, frame[0]], 0.25));
  // --- ステージ床
  segments.push(...polyline(floor.left, 0.15, "stage"), ...polyline(floor.right, 0.15, "stage"));

  // --- 左右の下部を分ける仕切り（右ルートの玉はヘソに届かない）
  segments.push(seg(100, -72, 100, -205, 0.25));

  // --- 右ルートのアタッカー床（右から左へ下る）。開口部は gimmick で扱う
  segments.push(seg(214, -92, 172, -112, 0.2));

  // --- ヘソ（スタートチャッカー）の左右の受け
  const heso = { x: 0, y: -130 };
  segments.push(seg(-8.2, -121, -8.2, -136, 0.2), seg(8.2, -121, 8.2, -136, 0.2));
  segments.push(seg(-8.2, -136, 8.2, -136, 0.1));

  // --- 一般入賞口（左下に2つ、右下に1つ）
  const pocketDefs = [
    { x: -98, y: -146, cover: 0 },
    { x: -42, y: -172, cover: 0 },
    { x: 60, y: -168, cover: 0 },
  ];
  for (const p of pocketDefs) {
    if (p.cover) nails.push({ x: p.x + p.cover, y: p.y + 14 }); // ふた釘（真上から落ちた玉を半分ほどはじく）
    segments.push(seg(p.x - 7.5, p.y + 6, p.x - 7.5, p.y - 6, 0.2), seg(p.x + 7.5, p.y + 6, p.x + 7.5, p.y - 6, 0.2));
  }

  // ================= 釘 =================
  // 天釘: 役物の天面の上に並ぶ
  nails.push(...nailLine(-104, 176, -22, 194, 14));
  nails.push(...nailLine(22, 194, 104, 176, 14));

  // 左ルート: 斜めにずらした釘の森
  const windmill: Windmill = { x: -163, y: 46, r: 8.5 };
  const warpGuide = nailLine(-148, 60, -136, 53, 12);
  nails.push(...warpGuide);
  const leftZone = (p: Vec) =>
    p.x < -128 &&
    Math.hypot(p.x, p.y) < INNER_RAIL_IN - 19 &&
    p.y > -58 &&
    p.y < 160 &&
    Math.hypot(p.x - windmill.x, p.y - windmill.y) > windmill.r + 9 &&
    !warpGuide.some((w) => Math.hypot(p.x - w.x, p.y - w.y) < 12);
  for (let row = 0; row < 14; row++) {
    const y = 150 - row * 16;
    const offset = row % 2 === 0 ? 0 : 10.5;
    for (let x = -206 + offset; x < -126; x += 21) {
      const p = { x, y };
      if (leftZone(p) && distToPolygon(p, frame) > 9) nails.push(p);
    }
  }

  // 道釘: 左下から中央へ。釘の頭をなめらかに転がるよう、物理は釘の上端の線分で受ける。
  // 所々に「こぼし」を作る。釘の間隔を少しだけ広げた隙間なので、勢いのある玉は飛び越え、
  // 遅い玉だけが落ちる
  const decorNails: Vec[] = [];
  const road = roadNails({ x: -192, y: -62 }, { x: -40, y: -106 }, 10.5, [3, 11, 13], 14);
  road.forEach((p, i) => {
    decorNails.push(p);
    const q = road[i + 1];
    if (q && Math.hypot(q.x - p.x, q.y - p.y) < 12) segments.push(seg(p.x, p.y + NAIL_R, q.x, q.y + NAIL_R, 0.25));
  });
  // 道の始まりはレールにつなげる（レールと釘の間に玉が挟まらないように）
  {
    const p = road[0];
    const dx = road[1].x - p.x;
    const dy = road[1].y - p.y;
    const len = Math.hypot(dx, dy);
    let t = 0;
    while (Math.hypot(p.x - (dx / len) * t, p.y - (dy / len) * t) < INNER_RAIL_IN + 2) t += 0.5;
    segments.push(seg(p.x - (dx / len) * t, p.y - (dy / len) * t + NAIL_R, p.x, p.y + NAIL_R, 0.25));
  }
  // 寄り釘 → ジャンプ釘 → 命釘
  nails.push({ x: -30, y: -107 }, { x: -24, y: -112 }, { x: -15, y: -108 });
  nails.push({ x: -6.6, y: -114 }, { x: 6.6, y: -114 }); // 命釘
  nails.push({ x: 15, y: -108 }, { x: 24, y: -112 }, { x: 30, y: -107 });
  // ステージ下（センター真下）の釘
  nails.push({ x: -40, y: -80 }, { x: 40, y: -80 }, { x: -20, y: -84 }, { x: 20, y: -84 });
  nails.push(...nailLine(94, -80, 44, -92, 12.5));
  // ハカマ（ヘソ周り）とヘソ下
  const lowerZone = (p: Vec) =>
    p.y < -120 &&
    p.y > -200 &&
    p.x > -205 &&
    p.x < 94 &&
    Math.hypot(p.x, p.y) < INNER_RAIL_IN - 19 &&
    Math.abs(p.x - heso.x) > 20 &&
    !pocketDefs.some((q) => Math.abs(p.x - q.x) < 16 && Math.abs(p.y - q.y) < 16);
  for (let row = 0; row < 6; row++) {
    const y = -124 - row * 16;
    const offset = row % 2 === 0 ? 0 : 11;
    for (let x = -200 + offset; x < 94; x += 22) {
      const p = { x, y };
      if (lowerZone(p) && !pointInPolygon(p, frame)) nails.push(p);
    }
  }

  // 右ルート: 天井を越えた玉は外レールに沿って落ち、ゲートを通って返し板で内側へ
  // 振られ、電チュー → アタッカーの順に流れる。上部の釘は弱めに越えた玉を散らす
  const rightZone = (p: Vec) =>
    p.x > 128 && Math.hypot(p.x, p.y) < BOARD_R - 16 && p.y > 34 && p.y < 120 && distToPolygon(p, frame) > 10;
  for (let row = 0; row < 6; row++) {
    const y = 112 - row * 15;
    const offset = row % 2 === 0 ? 0 : 8.5;
    for (let x = 132 + offset; x < 220; x += 17) {
      const p = { x, y };
      if (rightZone(p)) nails.push(p);
    }
  }
  // 返し板: 外レールを伝う玉を内側へ落とす
  const kickTh = deg(6);
  segments.push(seg((BOARD_R + 2) * Math.cos(kickTh), (BOARD_R + 2) * Math.sin(kickTh), 194, 0, 0.2));
  // 電チューへ寄せる板
  segments.push(seg(204, -10, 180, -26, 0.2));
  segments.push(seg(132, -10, 144, -26, 0.2));

  // ================= センサー =================
  const sensors: Sensor[] = [
    { id: "heso", kind: "heso", x0: -7.6, y0: -135, x1: 7.6, y1: -125 },
    { id: "denchu", kind: "denchu", x0: 152, y0: -52, x1: 168, y1: -42 },
    { id: "attacker", kind: "attacker", x0: 118, y0: -150, x1: 172, y1: -128 },
    { id: "gate", kind: "gate", x0: 186, y0: 78, x1: 214, y1: 104, passThrough: true },
    { id: "warp", kind: "warp", x0: -134, y0: 34, x1: -127.4, y1: 56 },
    { id: "out", kind: "out", x0: -260, y0: -260, x1: 260, y1: -206 },
    { id: "out-right", kind: "out", x0: 100, y0: -178, x1: 118, y1: -150 },
    ...pocketDefs.map((p, i) => ({
      id: `pocket-${i}`,
      kind: "pocket" as const,
      x0: p.x - 6.5,
      y0: p.y - 6,
      x1: p.x + 6.5,
      y1: p.y + 2,
    })),
  ];

  // ================= 開閉部品 =================
  const gimmicks: Gimmick[] = [
    {
      // 電チュー: 閉じると上が塞がる。開くと羽根が外へ開いて玉を拾う
      id: "denchu",
      whenClosed: [seg(148, -40, 160, -34, 0.3), seg(160, -34, 172, -40, 0.3), seg(150, -40, 150, -54, 0.3), seg(170, -40, 170, -54, 0.3)],
      whenOpen: [seg(150, -54, 138, -32, 0.3), seg(170, -54, 182, -32, 0.3)],
    },
    {
      // アタッカー: 閉じると床の一部（蓋）になる
      id: "attacker",
      whenClosed: [seg(172, -112, 118, -133, 0.2)],
      whenOpen: [seg(172, -112, 172, -126, 0.2), seg(118, -133, 118, -150, 0.2)],
    },
  ];

  // ================= レール =================
  const bands: Band[] = [
    { ra: BOARD_R, rb: BOARD_R + 10, fromDeg: OUTER_RAIL_END_DEG, toDeg: RAIL_START_DEG + 8 },
    { ra: INNER_RAIL_IN, rb: INNER_RAIL_R, fromDeg: INNER_RAIL_END_DEG, toDeg: RAIL_START_DEG + 8 },
  ];
  // 内レール先端のキャップ
  const tipR = (INNER_RAIL_IN + INNER_RAIL_R) / 2;
  const tipTh = deg(INNER_RAIL_END_DEG);
  nails.push({ x: tipR * Math.cos(tipTh), y: tipR * Math.sin(tipTh) });
  // 戻り球防止弁: 発射通路の出口を、上から落ちてきた玉にだけ塞ぐ片側通行の板
  segments.push({
    a: { x: INNER_RAIL_R * Math.cos(tipTh), y: INNER_RAIL_R * Math.sin(tipTh) },
    b: { x: (BOARD_R + 2) * Math.cos(tipTh), y: (BOARD_R + 2) * Math.sin(tipTh) },
    restitution: 0.25,
    layer: "board",
    oneWay: { x: Math.sin(tipTh), y: -Math.cos(tipTh) },
  });

  const startR = (BOARD_R + INNER_RAIL_R) / 2;
  const th = deg(RAIL_START_DEG);
  const launch = {
    x: startR * Math.cos(th),
    y: startR * Math.sin(th),
    // 時計回りの接線方向（左上へ）
    dirX: Math.sin(th),
    dirY: -Math.cos(th),
  };

  return {
    nails,
    decorNails,
    segments,
    bands,
    sensors,
    windmills: [windmill],
    gimmicks,
    frame,
    stageFloor: [...floor.left, ...floor.right],
    launch,
    warpExit: { x: -92, y: -46 },
    stageCenterHole: { x0: -6.8, x1: 6.8, y: -66 },
    heso,
  };
}
