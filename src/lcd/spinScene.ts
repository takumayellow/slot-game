import type { Scenario } from "../game/scenario";
import { reelPos, reelSpeed, symbolAt, type ReelPlan } from "./reels";
import {
  BLUE,
  GOLD,
  H,
  PINK,
  RED,
  W,
  clamp01,
  easeOut,
  easeOutBack,
  flash,
  hash,
  lerp,
  rainbow,
  span,
  sparkles,
  sunburst,
  text,
  vGrad,
  vignette,
  type G,
} from "./paint";
import { SYM_H, SYM_W, type SymbolSprites } from "./sprites";

/** 変動中の液晶。シナリオと変動の経過時間だけから描く */

export interface SceneCtx {
  g: G;
  /** 実時間 [s]（背景の揺らぎ用） */
  now: number;
  sprites: SymbolSprites;
  portrait: HTMLImageElement | null;
}

export interface SpinView {
  scenario: Scenario;
  plan: ReelPlan;
  /** 変動開始からの秒。止まった後も進み続ける */
  t: number;
  /** PUSH ボタンを押した時刻（変動内の秒） */
  pushedAt?: number;
}

interface Slot {
  x: number;
  y: number;
  s: number;
}

const NORMAL: Slot[] = [
  { x: 230, y: 380, s: 1 },
  { x: 520, y: 380, s: 1 },
  { x: 810, y: 380, s: 1 },
];
/** SP リーチ中は図柄を下に小さく並べ、真ん中で演出を見せる */
const BOTTOM: Slot[] = [
  { x: 190, y: 615, s: 0.56 },
  { x: 520, y: 615, s: 0.56 },
  { x: 850, y: 615, s: 0.56 },
];

/** 押さなくても決着の少し前に自動で押したことにする */
const AUTO_PUSH_LEAD = 0.5;

export function pushTime(v: SpinView): number | undefined {
  const s = v.scenario;
  if (s.pushAt === undefined) return undefined;
  return v.pushedAt ?? s.stops[1] - AUTO_PUSH_LEAD;
}

export function drawSpin(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const t = v.t;
  const settled = t >= s.stops[1];

  // ---- 背景の上に重ねる演出の層（図柄より奥）
  if (s.kind === "zenkaiten" && t >= 0.3) drawZenkaitenBack(c, t);
  const spK = s.spAt !== undefined ? span(t, s.spAt, s.spAt + 0.6) : 0;
  const backK = settled ? span(t, s.stops[1], s.stops[1] + 0.5) : 0;
  const layoutK = spK * (1 - backK);
  if (s.spspAt !== undefined && t >= s.spspAt && !settled) drawSpsp(c, v);
  else if (s.spAt !== undefined && t >= s.spAt && !settled) drawSp(c, v);

  // リーチ中は真ん中の列の後ろを赤く光らせる
  const reach = s.reachAt !== undefined && t >= s.reachAt && !settled;
  if (reach && layoutK < 0.5) {
    const pulse = 0.55 + 0.45 * Math.sin(c.now * 9);
    const gr = g.createRadialGradient(NORMAL[1].x, NORMAL[1].y, 20, NORMAL[1].x, NORMAL[1].y, 230);
    gr.addColorStop(0, `rgba(255,60,80,${0.55 * pulse})`);
    gr.addColorStop(1, "rgba(255,60,80,0)");
    g.fillStyle = gr;
    g.fillRect(NORMAL[1].x - 240, 0, 480, H);
  }

  // ---- 図柄
  const blackout = s.kind === "sudden" && t >= 0.5 && t < s.stops[0];
  if (blackout) drawSuddenBlackout(c, t);
  else {
    const frozen = pseudoFreeze(v);
    for (let i = 0; i < 3; i++) {
      const slot = mix(NORMAL[i], BOTTOM[i], easeOut(layoutK));
      drawReel(c, v, i, slot, frozen?.[i]);
    }
  }

  // ---- 図柄より手前の演出
  if (reach) drawReachTitle(c, t - s.reachAt!);
  if (s.kind === "zenkaiten" && t >= 0.3 && t < 3) drawSlam(c, "全回転", t - 0.3, "rainbow");
  for (let i = 0; i < s.pseudo.length; i++) {
    const p = s.pseudo[i];
    if (t >= p - 0.2 && t < p + 1) drawNext(c, t - p + 0.2, i + 2);
  }
  if (s.cutinAt !== undefined && s.cutin !== "none" && t >= s.cutinAt && t < s.cutinAt + 1.7) {
    drawCutin(c, s.cutin, t - s.cutinAt);
  }
  drawPush(c, v);
  if (settled) drawSettle(c, v, t - s.stops[1]);
  if (s.kind === "sudden" && t >= s.stops[0]) flash(g, "#fff6c0", 1 - span(t, s.stops[0], s.stops[0] + 0.5));
}

function mix(a: Slot, b: Slot, k: number): Slot {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k) };
}

/** 擬似連: NEXT の直前に図柄を一瞬止める */
function pseudoFreeze(v: SpinView): number[] | null {
  for (const p of v.scenario.pseudo) {
    if (v.t >= p - 0.45 && v.t < p + 0.15) {
      return [0, 1, 2].map((i) => Math.round(reelPos(v.plan, i, p - 0.45)));
    }
  }
  return null;
}

function drawReel(c: SceneCtx, v: SpinView, i: number, slot: Slot, frozen?: number): void {
  const { g } = c;
  const s = v.scenario;
  const pos = frozen ?? reelPos(v.plan, i, v.t);
  const speed = frozen !== undefined ? 0 : reelSpeed(v.plan, i, v.t);
  const k = Math.floor(pos);
  const frac = pos - k;
  const cell = SYM_H * 0.86 * slot.s;

  // 止まった瞬間に少し沈んで戻る
  const since = v.t - s.stops[i];
  const bounce = since >= 0 && since < 0.28 ? Math.sin((since / 0.28) * Math.PI) * 16 * slot.s * (1 - since / 0.28) : 0;
  // 擬似連の停止は小刻みに揺らす
  const shake = frozen !== undefined ? Math.sin(c.now * 70) * 3 : 0;

  g.save();
  g.beginPath();
  g.rect(slot.x - SYM_W * slot.s * 0.62, slot.y - cell * 1.25, SYM_W * slot.s * 1.24, cell * 2.5);
  g.clip();
  for (let j = -1; j <= 2; j++) {
    const y = slot.y - (j - frac) * cell + bounce;
    const d = Math.min(1.4, Math.abs(y - slot.y) / cell);
    if (d >= 1.4) continue;
    const n = symbolAt(k + j);
    const img = speed > 5 ? c.sprites.blur[n] : c.sprites.sharp[n];
    const sc = slot.s * (1 - 0.22 * Math.min(1, d));
    g.globalAlpha = 1 - 0.72 * Math.min(1, d);
    g.drawImage(img, slot.x - (SYM_W * sc) / 2 + shake, y - (SYM_H * sc) / 2, SYM_W * sc, SYM_H * sc);
  }
  g.restore();
}

function drawReachTitle(c: SceneCtx, dt: number): void {
  const { g } = c;
  if (dt < 1.2) {
    const k = easeOutBack(dt / 0.25);
    const fade = 1 - span(dt, 0.9, 1.2);
    g.save();
    g.globalAlpha = fade;
    g.translate(W / 2, 130);
    g.scale(2.4 - 1.4 * k, 2.4 - 1.4 * k);
    text(g, "リーチ!", 0, 0, { size: 120, fill: vGrad(g, -60, 60, RED), stroke: "#fff", strokeW: 14, outer: "#3a0010", outerW: 32, glow: "#ff3050" });
    g.restore();
    vignette(g, "rgba(255,0,40,0.8)", 0.6 * fade);
  } else {
    text(g, "リーチ", 90, 48, { size: 38, fill: vGrad(g, 30, 66, RED), stroke: "#fff", strokeW: 6, outer: "#3a0010", outerW: 14 });
  }
}

/** 画面いっぱいに叩きつける文字 */
function drawSlam(c: SceneCtx, s: string, dt: number, style: "rainbow" | "gold" | "red"): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.3);
  g.save();
  g.globalAlpha = 1 - span(dt, 2.2, 2.7);
  g.translate(W / 2, H * 0.42);
  g.scale(3 - 2 * k, 3 - 2 * k);
  g.rotate(-0.06);
  const fill = style === "rainbow" ? rainbow(g, -300, 300, c.now * 0.6) : vGrad(g, -80, 80, style === "gold" ? GOLD : RED);
  text(g, s, 0, 0, { size: 170, fill, stroke: "#fff", strokeW: 16, outer: "#1a0630", outerW: 38, glow: "#fff" });
  g.restore();
}

function drawNext(c: SceneCtx, dt: number, count: number): void {
  const { g } = c;
  flash(g, "#ffffff", 0.7 * (1 - span(dt, 0, 0.25)));
  const k = easeOutBack(dt / 0.25);
  g.save();
  g.globalAlpha = 1 - span(dt, 0.9, 1.2);
  g.translate(W / 2, 140);
  g.scale(k, k);
  text(g, "NEXT", -60, 0, { size: 120, fill: vGrad(g, -60, 60, BLUE), stroke: "#fff", strokeW: 12, outer: "#061a50", outerW: 30, glow: "#5fd0ff" });
  text(g, `×${count}`, 190, 10, { size: 96, fill: vGrad(g, -50, 50, GOLD), stroke: "#fff", strokeW: 10, outer: "#4a1a00", outerW: 26 });
  g.restore();
}

const CUTIN_STYLE = {
  blue: { band: ["#0b2a7a", "#2f7bff", "#0b2a7a"], text: "チャンス!", fill: BLUE, rim: "#9fe3ff" },
  red: { band: ["#5a0014", "#ff2a4a", "#5a0014"], text: "激アツ!!", fill: RED, rim: "#ffd0d8" },
  gold: { band: ["#5a3000", "#ffc23a", "#5a3000"], text: "キタ━━!!", fill: GOLD, rim: "#fff6c0" },
} as const;

function drawCutin(c: SceneCtx, kind: "blue" | "red" | "gold", dt: number): void {
  const { g } = c;
  const st = CUTIN_STYLE[kind];
  const inK = easeOut(dt / 0.2);
  const outK = span(dt, 1.45, 1.7);
  const x = (1 - inK) * W - outK * W * 1.2;
  const y0 = 250;
  const h = 250;
  g.save();
  g.translate(x, 0);
  // 斜めの帯
  g.beginPath();
  g.moveTo(-40, y0 + 30);
  g.lineTo(W + 40, y0 - 30);
  g.lineTo(W + 40, y0 + h - 30);
  g.lineTo(-40, y0 + h + 30);
  g.closePath();
  g.fillStyle = vGrad(g, y0 - 30, y0 + h + 30, [...st.band]);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = st.rim;
  g.stroke();
  g.clip();
  // 帯の中を流れる線
  g.globalAlpha = 0.25;
  g.fillStyle = "#fff";
  for (let i = 0; i < 14; i++) {
    const ly = y0 + hash(i) * h;
    const lx = ((hash(i + 9) * W * 2 - dt * 2400) % (W * 2)) + W * 0.5;
    g.fillRect(lx, ly, 160 + hash(i + 3) * 200, 3);
  }
  g.globalAlpha = 1;
  // つむぎの顔を帯の左に
  if (c.portrait) {
    const p = c.portrait;
    const fw = p.width * 0.52;
    const fh = fw * 0.72;
    const sx = p.width * 0.62 - fw / 2;
    const sy = p.height * 0.14 - fh * 0.48;
    g.drawImage(p, sx, sy, fw, fh, 40, y0 - 20, (h + 40) / 0.72, h + 40);
  }
  g.restore();
  g.save();
  g.translate(x, 0);
  text(g, st.text, W * 0.66, y0 + h / 2, {
    size: 130,
    fill: vGrad(g, y0 + 60, y0 + h - 60, [...st.fill]),
    stroke: "#fff",
    strokeW: 14,
    outer: "#14061e",
    outerW: 34,
    glow: st.rim,
  });
  g.restore();
}

/** SP リーチ（つむぎリーチ） */
function drawSp(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const dt = v.t - s.spAt!;
  sunburst(g, W / 2, H * 0.45, 900, 24, c.now * 0.25, "rgba(255,190,230,0.9)", "rgba(255,120,180,0.95)");
  const glow = g.createRadialGradient(W / 2, H * 0.4, 30, W / 2, H * 0.4, 520);
  glow.addColorStop(0, "rgba(255,248,210,0.95)");
  glow.addColorStop(1, "rgba(255,248,210,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  sparkles(g, c.now, 40, "#fff", 50, 3);
  drawPortrait(c, W * 0.5 + (1 - easeOut(dt / 0.5)) * W * 0.6, 40, 1.0, Math.sin(c.now * 2) * 6);
  drawTitleBand(c, "つむぎリーチ", PINK, dt);
  drawCountdown(c, v, ["#ffe680", "#ff7ab8"]);
}

/** SPSP リーチ（最終決戦） */
function drawSpsp(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const dt = v.t - s.spspAt!;
  g.fillStyle = vGrad(g, 0, H, ["#1a0006", "#4a0010", "#0a0003"]);
  g.fillRect(0, 0, W, H);
  sunburst(g, W / 2, H * 0.42, 900, 18, -c.now * 0.4, "rgba(255,40,40,0.28)", "rgba(0,0,0,0)");
  // 稲妻
  const bolt = Math.floor(c.now * 5);
  if (hash(bolt) > 0.72) {
    g.save();
    g.strokeStyle = "rgba(255,240,255,0.9)";
    g.lineWidth = 5;
    g.shadowColor = "#ff60ff";
    g.shadowBlur = 30;
    let x = hash(bolt + 1) * W;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y < H; y += 60) {
      x += (hash(bolt * 13 + y) - 0.5) * 120;
      g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
    flash(g, "#ffd0ff", 0.12);
  }
  drawPortrait(c, W * 0.5, 40 + Math.sin(c.now * 30) * (dt < 1.2 ? 4 : 0), 1.0, 0, "rgba(255,40,60,0.9)");
  vignette(g, "rgba(0,0,0,0.95)", 0.8);
  if (dt < 1.6) {
    flash(g, "#ff2040", 0.6 * (1 - dt / 0.4));
    drawSlam(c, "最終決戦", dt, "red");
  } else {
    drawTitleBand(c, "最終決戦", RED, 99);
  }
  drawCountdown(c, v, ["#ff4040", "#ffd040"]);
}

function drawPortrait(c: SceneCtx, cx: number, top: number, scale: number, rot: number, rim?: string): void {
  if (!c.portrait) return;
  const { g } = c;
  const p = c.portrait;
  const h = 1280 * scale;
  const w = (p.width / p.height) * h;
  g.save();
  g.translate(cx, top + h / 2);
  g.rotate((rot * Math.PI) / 180 / 10);
  if (rim) {
    g.shadowColor = rim;
    g.shadowBlur = 40;
  }
  g.drawImage(p, -w * 0.62, -h / 2, w, h);
  g.restore();
}

function drawTitleBand(c: SceneCtx, title: string, colors: readonly string[], dt: number): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.35);
  g.save();
  g.translate(W / 2, 70);
  g.scale(k, k);
  g.fillStyle = "rgba(10,0,20,0.55)";
  g.beginPath();
  g.roundRect(-320, -48, 640, 96, 48);
  g.fill();
  text(g, title, 0, 2, { size: 72, fill: vGrad(g, -36, 36, [...colors]), stroke: "#fff", strokeW: 9, outer: "#1a0620", outerW: 22 });
  g.restore();
}

/** 決着までのゲージ */
function drawCountdown(c: SceneCtx, v: SpinView, colors: [string, string]): void {
  const { g } = c;
  const s = v.scenario;
  const from = s.spspAt ?? s.spAt!;
  const k = clamp01((v.t - from) / (s.stops[1] - from));
  const x = 220;
  const y = 548;
  const w = W - 440;
  g.save();
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.roundRect(x - 6, y - 6, w + 12, 30, 15);
  g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, colors[0]);
  gr.addColorStop(1, colors[1]);
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, Math.max(18, w * k), 18, 9);
  g.fill();
  g.restore();
  if (k > 0.82) {
    const blink = Math.sin(c.now * 14) > 0 ? 1 : 0.6;
    g.save();
    g.globalAlpha = blink;
    text(g, "決着!!", W / 2, 505, { size: 58, fill: vGrad(g, 480, 530, GOLD), stroke: "#fff", strokeW: 8, outer: "#3a0a00", outerW: 18 });
    g.restore();
  }
}

function drawPush(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  if (s.pushAt === undefined || v.t < s.pushAt) return;
  const pt = pushTime(v)!;
  if (v.t < pt && v.t < s.stops[1]) {
    // 押して！の表示
    const pulse = 1 + 0.08 * Math.sin(c.now * 16);
    g.save();
    g.translate(W / 2, H * 0.45);
    g.scale(pulse, pulse);
    const gr = g.createRadialGradient(0, -20, 10, 0, 0, 150);
    gr.addColorStop(0, "#ffd0e0");
    gr.addColorStop(0.5, "#ff2d6a");
    gr.addColorStop(1, "#6a0024");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 140, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 14;
    g.strokeStyle = "#ffe9a0";
    g.stroke();
    text(g, "PUSH", 0, 6, { size: 96, fill: "#fff", stroke: "#6a0024", strokeW: 16 });
    g.restore();
    text(g, "ボタンを押して!", W / 2, H * 0.45 + 200, { size: 54, fill: vGrad(g, H * 0.45 + 175, H * 0.45 + 225, GOLD), stroke: "#fff", strokeW: 7, outer: "#3a0a00", outerW: 18 });
    return;
  }
  const dt = v.t - pt;
  if (dt < 0) return;
  if (s.hit) {
    flash(g, "#ffffff", 1 - span(dt, 0.05, 0.6));
    if (v.t < s.stops[1]) {
      g.save();
      const k = easeOutBack(dt / 0.3);
      g.translate(W / 2, H * 0.36);
      g.scale(k, k);
      text(g, "激アツ!!", 0, 0, { size: 150, fill: rainbow(g, -300, 300, c.now), stroke: "#fff", strokeW: 16, outer: "#1a0630", outerW: 36, glow: "#fff" });
      g.restore();
    }
  } else {
    flash(g, "#ffffff", 0.6 * (1 - span(dt, 0, 0.25)));
  }
}

/** 決着: 当たりは虹の光、ハズレは暗く沈める */
function drawSettle(c: SceneCtx, v: SpinView, dt: number): void {
  const { g } = c;
  const s = v.scenario;
  if (s.hit) {
    flash(g, "#ffffff", 0.85 * (1 - span(dt, 0, 0.45)));
    const pulse = 0.5 + 0.5 * Math.sin(c.now * 10);
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(W / 2, NORMAL[1].y, 60, W / 2, NORMAL[1].y, 520);
    gr.addColorStop(0, `rgba(255,240,180,${0.35 + 0.25 * pulse})`);
    gr.addColorStop(1, "rgba(255,120,200,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
    sparkles(g, c.now, 50, "#fff7c0", 80, 9);
    return;
  }
  if (s.kind !== "hazure") {
    g.save();
    g.globalAlpha = 0.45 * span(dt, 0, 0.3);
    g.fillStyle = "#0a0a18";
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

function drawZenkaitenBack(c: SceneCtx, t: number): void {
  const { g } = c;
  g.save();
  g.globalAlpha = span(t, 0.3, 0.8);
  sunburst(g, W / 2, H * 0.5, 900, 30, c.now * 0.6, "rgba(255,255,255,0.35)", "rgba(0,0,0,0)");
  g.globalCompositeOperation = "overlay";
  g.fillStyle = rainbow(g, 0, W, c.now * 0.3);
  g.fillRect(0, 0, W, H);
  g.restore();
}

function drawSuddenBlackout(c: SceneCtx, t: number): void {
  const { g } = c;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  // ひび
  g.save();
  g.strokeStyle = "rgba(255,240,200,0.9)";
  g.lineWidth = 3;
  g.shadowColor = "#ffd060";
  g.shadowBlur = 16;
  const k = span(t, 0.9, 1.6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hash(i) * 0.4;
    g.beginPath();
    g.moveTo(W / 2, H / 2);
    let x = W / 2;
    let y = H / 2;
    for (let j = 1; j <= 5; j++) {
      const r = (j / 5) * 520 * k;
      x = W / 2 + Math.cos(a + (hash(i * 9 + j) - 0.5) * 0.4) * r;
      y = H / 2 + Math.sin(a + (hash(i * 9 + j) - 0.5) * 0.4) * r;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
  if (t > 1.0) {
    const dt = t - 1.0;
    g.save();
    g.translate(W / 2 + Math.sin(c.now * 60) * 4, H / 2);
    const s = easeOutBack(dt / 0.25);
    g.scale(s, s);
    text(g, "!?", 0, 0, { size: 220, fill: vGrad(g, -100, 100, GOLD), stroke: "#fff", strokeW: 16, outer: "#3a1800", outerW: 40, glow: "#ffd060" });
    g.restore();
  }
}
