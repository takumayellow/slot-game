import { FONT } from "../render/boardArt";

/** 液晶の論理サイズ [px]。液晶の実寸 208 × 154 mm を 5 px/mm で描く */
export const W = 1040;
export const H = 770;

export type G = CanvasRenderingContext2D;
export type Fill = string | CanvasGradient;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const easeOut = (k: number): number => 1 - (1 - clamp01(k)) ** 3;
/** 少し行き過ぎて戻る */
export function easeOutBack(k: number): number {
  const x = clamp01(k) - 1;
  return 1 + 2.4 * x ** 3 + 1.4 * x ** 2;
}
/** 0..1 の区間 [a, b] での進み具合 */
export const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));

/** 決まった値を返す疑似乱数（毎フレーム同じ位置に出したい粒に使う） */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface TextOpts {
  size: number;
  fill: Fill;
  stroke?: string;
  strokeW?: number;
  /** 外側の 2 本目の縁 */
  outer?: string;
  outerW?: number;
  align?: CanvasTextAlign;
  glow?: string;
  glowBlur?: number;
}

/** 縁取りした文字。パチンコの液晶の文字はほぼ全部これ */
export function text(g: G, s: string, x: number, y: number, o: TextOpts): void {
  g.save();
  g.font = `${o.size}px ${FONT}`;
  g.textAlign = o.align ?? "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = o.glowBlur ?? o.size * 0.4;
  }
  if (o.outer) {
    g.lineWidth = o.outerW ?? o.size * 0.3;
    g.strokeStyle = o.outer;
    g.strokeText(s, x, y);
    g.shadowBlur = 0;
  }
  if (o.stroke) {
    g.lineWidth = o.strokeW ?? o.size * 0.14;
    g.strokeStyle = o.stroke;
    g.strokeText(s, x, y);
    g.shadowBlur = 0;
  }
  g.fillStyle = o.fill;
  g.fillText(s, x, y);
  g.restore();
}

export function vGrad(g: G, y0: number, y1: number, stops: string[]): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}

/** 横向きの虹。shift で色が流れる */
export function rainbow(g: G, x0: number, x1: number, shift = 0): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${(i * 60 + shift * 360) % 360}, 100%, 62%)`);
  return gr;
}

export const GOLD = ["#fffbe0", "#ffd84a", "#ff9d1f", "#c25a00"];
export const RED = ["#fff0f0", "#ff6b6b", "#e0102e", "#7a0018"];
export const BLUE = ["#f0fbff", "#7fdcff", "#2f7bff", "#10307a"];
export const PINK = ["#fff0fa", "#ff9fd2", "#ff3d9a", "#8a0848"];
export const SILVER = ["#ffffff", "#d8dbe6", "#8d92a6", "#4a4e60"];

/** 中心から放射する集中線 */
export function sunburst(g: G, x: number, y: number, r: number, rays: number, angle: number, c1: string, c2: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = c2;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.fillStyle = c1;
  const step = (Math.PI * 2) / rays;
  for (let i = 0; i < rays; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, i * step, i * step + step / 2);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** 斜めのストライプ（RUSH・時短の背景） */
export function stripes(g: G, color: string, width: number, offset: number, slope = 0.6): void {
  g.save();
  g.fillStyle = color;
  const period = width * 2;
  const shift = ((offset % period) + period) % period;
  for (let x = -H * slope - period + shift; x < W + period; x += period) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + width, 0);
    g.lineTo(x + width - H * slope, H);
    g.lineTo(x - H * slope, H);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** 漂うきらめき。時刻から位置を決めるので状態を持たない */
export function sparkles(g: G, t: number, n: number, color: string, speed = 30, seed = 0): void {
  g.save();
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i + seed * 101);
    const h2 = hash(i * 7.3 + seed);
    const x = h1 * W;
    const y = (((h2 * H - t * speed * (0.4 + h1)) % H) + H) % H;
    const tw = 0.5 + 0.5 * Math.sin(t * (2 + h2 * 4) + i);
    const s = 2 + h2 * 5 * tw;
    g.globalAlpha = 0.25 + 0.75 * tw;
    g.beginPath();
    g.moveTo(x, y - s * 2);
    g.lineTo(x + s * 0.5, y - s * 0.5);
    g.lineTo(x + s * 2, y);
    g.lineTo(x + s * 0.5, y + s * 0.5);
    g.lineTo(x, y + s * 2);
    g.lineTo(x - s * 0.5, y + s * 0.5);
    g.lineTo(x - s * 2, y);
    g.lineTo(x - s * 0.5, y - s * 0.5);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** 紙吹雪（大当たり中） */
export function confetti(g: G, t: number, n: number): void {
  g.save();
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 3.1);
    const h2 = hash(i * 5.7 + 2);
    const fall = 90 + h2 * 140;
    const y = ((t * fall + h1 * H * 1.2) % (H + 60)) - 30;
    const x = h1 * W + Math.sin(t * (1 + h2 * 2) + i) * 30;
    const flip = Math.abs(Math.cos(t * 5 + i));
    g.save();
    g.translate(x, y);
    g.rotate(t * (2 + h1 * 4) + i);
    g.fillStyle = `hsl(${(h2 * 360 + t * 40) % 360}, 95%, 65%)`;
    g.fillRect(-7, -3.5 * flip, 14, 7 * flip + 1);
    g.restore();
  }
  g.restore();
}

/** 画面全体を色で覆う（フラッシュ・暗転） */
export function flash(g: G, color: string, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = clamp01(alpha);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** 周辺を暗く・色付きにする */
export function vignette(g: G, color: string, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, color);
  g.globalAlpha = clamp01(alpha);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.restore();
}

export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
