import type { Vec } from "../sim/board";

/** 符号付き面積（反時計回りで正） */
export function signedArea(poly: Vec[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** 多角形を内側へ d だけ縮める（頂点ごとに隣の辺の法線を平均して動かす） */
export function insetPolygon(poly: Vec[], d: number): Vec[] {
  const ccw = signedArea(poly) > 0;
  const n = poly.length;
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n];
    const next = poly[(i + 1) % n];
    const inward = (a: Vec, b: Vec) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // 反時計回りなら左が内側
      return ccw ? { x: -dy / len, y: dx / len } : { x: dy / len, y: -dx / len };
    };
    const n1 = inward(prev, p);
    const n2 = inward(p, next);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    // 角が鋭いほど大きく動かす（ただし伸びすぎないように抑える）
    const cos = Math.max(0.5, mx * n1.x + my * n1.y);
    return { x: p.x + (mx * d) / cos, y: p.y + (my * d) / cos };
  });
}

