import * as THREE from "three";
import { LCD_Z } from "./board3d";
import type { Materials } from "./materials";

/** 液晶の上のアーチに収まっている可動役物。熱い場面で液晶の前へ落ちてくる */

const REST_Y = 126;
const DROP_Y = 28;
const Z = LCD_Z + 9;
const FALL = 0.32;
const HOLD = 1.5;
const RISE = 0.7;

export interface Emblem {
  group: THREE.Group;
  drop(now: number): void;
  update(now: number): void;
}

export function buildEmblem(m: Materials): Emblem {
  const group = new THREE.Group();
  const star = new THREE.Shape();
  const n = 5;
  for (let i = 0; i <= n * 2; i++) {
    const r = i % 2 === 0 ? 30 : 13;
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    if (i === 0) star.moveTo(r * Math.cos(a), r * Math.sin(a));
    else star.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(star, { depth: 5, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2, bevelSegments: 3 }).translate(0, 0, -2.5),
    m.gold,
  );
  body.castShadow = true;
  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0xff4fa0,
    emissive: 0xff2d8a,
    emissiveIntensity: 0.6,
    roughness: 0.08,
    clearcoat: 1,
  });
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), gemMat);
  gem.scale.z = 0.6;
  gem.position.z = 5;
  const pivot = new THREE.Group();
  pivot.add(body, gem);
  group.add(pivot);
  group.position.set(0, REST_Y, Z);

  let start = -Infinity;
  return {
    group,
    drop(now: number) {
      // 待機中なら頭から落とす。出ている最中に重ねて呼ばれたら、止まっている時間を延ばす
      const e = now - start;
      start = e >= FALL + HOLD + RISE ? now : now - Math.min(FALL, e);
    },
    update(now: number) {
      const t = now - start;
      let k: number;
      if (t < FALL) k = bounceOut(t / FALL);
      else if (t < FALL + HOLD) k = 1;
      else if (t < FALL + HOLD + RISE) k = 1 - smooth((t - FALL - HOLD) / RISE);
      else k = 0;
      group.position.y = REST_Y + (DROP_Y - REST_Y) * k;
      group.scale.setScalar(1 + 0.45 * k);
      // 待機中はゆっくり揺れ、落ちている間は回る
      pivot.rotation.y = k > 0 && t < FALL + HOLD ? (t / FALL) * Math.PI * 2 * Math.min(1, t / FALL) : Math.sin(now * 1.3) * 0.35;
      pivot.rotation.z = Math.sin(now * 0.9) * 0.06;
      gemMat.emissiveIntensity = 0.6 + k * (2.4 + Math.sin(now * 20));
    },
  };
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

function bounceOut(k: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}
