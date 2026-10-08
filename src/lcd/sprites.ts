import { FONT } from "../render/boardArt";

/**
 * 図柄の絵。1〜9 を最初に一度だけ描いておき、毎フレームは drawImage するだけにする。
 * 奇数（RUSH 図柄）は赤金、7 は虹、偶数は青。高速回転用に縦ブラー版も作る。
 */
export const SYM_W = 230;
export const SYM_H = 270;

export interface SymbolSprites {
  sharp: HTMLCanvasElement[];
  blur: HTMLCanvasElement[];
}

export function symbolStyle(n: number): "rainbow" | "red" | "blue" {
  if (n === 7) return "rainbow";
  return n % 2 === 1 ? "red" : "blue";
}

export function makeSymbolSprites(): SymbolSprites {
  const sharp: HTMLCanvasElement[] = [];
  const blur: HTMLCanvasElement[] = [];
  for (let n = 1; n <= 9; n++) {
    const s = drawSymbol(n);
    sharp[n] = s;
    blur[n] = motionBlur(s);
  }
  return { sharp, blur };
}

function drawSymbol(n: number): HTMLCanvasElement {
  const c = canvas(SYM_W, SYM_H);
  const g = c.getContext("2d")!;
  const style = symbolStyle(n);
  const cx = SYM_W / 2;
  const cy = SYM_H / 2 + 6;

  // 図柄の後ろの台座（奇数は星、偶数は丸）
  g.save();
  g.translate(cx, cy);
  const plate = g.createRadialGradient(0, -20, 10, 0, 0, 110);
  if (style === "blue") {
    plate.addColorStop(0, "rgba(140,220,255,0.55)");
    plate.addColorStop(1, "rgba(40,90,220,0)");
    g.fillStyle = plate;
    g.beginPath();
    g.arc(0, 0, 105, 0, Math.PI * 2);
    g.fill();
  } else {
    plate.addColorStop(0, style === "rainbow" ? "rgba(255,255,255,0.7)" : "rgba(255,210,120,0.6)");
    plate.addColorStop(1, "rgba(255,80,120,0)");
    g.fillStyle = plate;
    star(g, 0, 0, 118, 58, 5);
    g.fill();
  }
  g.restore();

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `236px ${FONT}`;
  const text = String(n);
  const ty = cy + 4;

  // 外側の太い縁 → 白い縁 → 本体
  g.lineJoin = "round";
  g.lineWidth = 30;
  g.strokeStyle = style === "blue" ? "#071a52" : style === "rainbow" ? "#3a0a5a" : "#4a0012";
  g.strokeText(text, cx, ty);
  g.lineWidth = 14;
  g.strokeStyle = "#ffffff";
  g.strokeText(text, cx, ty);

  g.fillStyle = bodyGradient(g, style);
  g.fillText(text, cx, ty);

  // 上半分のハイライト
  g.save();
  g.globalCompositeOperation = "source-atop";
  const hl = g.createLinearGradient(0, ty - 110, 0, ty);
  hl.addColorStop(0, "rgba(255,255,255,0.75)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(0, 0, SYM_W, ty - 6);
  g.restore();
  return c;
}

function bodyGradient(g: CanvasRenderingContext2D, style: "rainbow" | "red" | "blue"): CanvasGradient {
  if (style === "rainbow") {
    const r = g.createLinearGradient(30, 0, SYM_W - 30, 0);
    ["#ff4d6d", "#ffb13b", "#fff35c", "#4dff9a", "#4dc3ff", "#a86bff"].forEach((col, i, a) => r.addColorStop(i / (a.length - 1), col));
    return r;
  }
  const v = g.createLinearGradient(0, 40, 0, SYM_H - 30);
  if (style === "red") {
    v.addColorStop(0, "#fff5b8");
    v.addColorStop(0.35, "#ffc02e");
    v.addColorStop(0.7, "#ff4a3a");
    v.addColorStop(1, "#b0102a");
  } else {
    v.addColorStop(0, "#f2fdff");
    v.addColorStop(0.4, "#7fdcff");
    v.addColorStop(1, "#2459ff");
  }
  return v;
}

/** 縦方向に少しずつずらして重ね、高速回転の残像にする */
function motionBlur(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas(SYM_W, SYM_H);
  const g = c.getContext("2d")!;
  const N = 9;
  for (let i = 0; i < N; i++) {
    g.globalAlpha = 0.22;
    g.drawImage(src, 0, (i - (N - 1) / 2) * 11);
  }
  return c;
}

export function star(g: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, n: number): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
