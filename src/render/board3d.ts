import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BOARD_R,
  INNER_RAIL_END_DEG,
  INNER_RAIL_IN,
  INNER_RAIL_R,
  OUTER_RAIL_END_DEG,
  RAIL_START_DEG,
  type BoardLayout,
  type Vec,
} from "../sim/board";
import { ART_HALF } from "./boardArt";
import { insetPolygon } from "./geom";
import type { Materials } from "./materials";

/** 盤面の奥行き [mm]。盤面が z=0、ガラスが GLASS_Z */
export const NAIL_LEN = 13;
export const FRAME_DEPTH = 19;
export const GLASS_Z = 22;
export const LCD_Z = -18;
/** 液晶の位置と大きさ [mm] */
export const LCD_RECT = { x0: -104, y0: -56, x1: 104, y1: 98 };

const deg = (d: number) => (d * Math.PI) / 180;

export interface BoardParts {
  group: THREE.Group;
  boardMat: THREE.MeshPhysicalMaterial;
  frameInner: Vec[];
  denchuWings: THREE.Object3D[];
  denchuRoof: THREE.Object3D;
  attackerLid: THREE.Object3D;
  attackerGlow: THREE.MeshBasicMaterial;
  windmills: THREE.Object3D[];
  lamps: Record<"heso" | "gate" | "pocket" | "warp" | "denchu", THREE.MeshStandardMaterial>;
  frameLed: THREE.MeshStandardMaterial;
  stageLed: THREE.MeshStandardMaterial;
}

export function buildBoard3d(layout: BoardLayout, m: Materials, art: THREE.Texture): BoardParts {
  const group = new THREE.Group();
  const frameInner = insetPolygon(layout.frame, 7);

  // ---- 盤面（センターの内側は液晶が見えるように抜く）
  const face = new THREE.Shape([
    new THREE.Vector2(-ART_HALF, -ART_HALF),
    new THREE.Vector2(ART_HALF, -ART_HALF),
    new THREE.Vector2(ART_HALF, ART_HALF),
    new THREE.Vector2(-ART_HALF, ART_HALF),
  ]);
  face.holes.push(new THREE.Path(frameInner.map((p) => new THREE.Vector2(p.x, p.y))));
  const faceGeo = new THREE.ShapeGeometry(face, 1);
  worldUv(faceGeo);
  const boardMat = new THREE.MeshPhysicalMaterial({ map: art, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const faceMesh = new THREE.Mesh(faceGeo, boardMat);
  faceMesh.receiveShadow = true;
  group.add(faceMesh);

  // ---- 釘（軸 + 頭）。インスタンスで一度に描く
  const shaft = new THREE.CylinderGeometry(0.75, 0.75, NAIL_LEN, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, NAIL_LEN / 2);
  const head = new THREE.CylinderGeometry(1.55, 1.45, 0.9, 14).rotateX(Math.PI / 2).translate(0, 0, NAIL_LEN + 0.45);
  const nailGeo = mergeGeometries([shaft, head])!;
  const allNails = [...layout.nails, ...layout.decorNails];
  const nails = new THREE.InstancedMesh(nailGeo, m.brass, allNails.length);
  const mat4 = new THREE.Matrix4();
  allNails.forEach((n, i) => nails.setMatrixAt(i, mat4.makeTranslation(n.x, n.y, 0)));
  nails.castShadow = true;
  group.add(nails);

  // ---- レール（金属の帯を盤面に立てる）
  group.add(railArc(BOARD_R, BOARD_R + 1.6, OUTER_RAIL_END_DEG, RAIL_START_DEG + 8, m.chrome));
  group.add(railArc(INNER_RAIL_IN, INNER_RAIL_R, INNER_RAIL_END_DEG, RAIL_START_DEG + 8, m.chrome));

  // ---- 板の部品（ステージを除く board レイヤーの線分のうち、役物の外形以外）
  for (const s of layout.segments) {
    if (s.layer !== "board" || s.oneWay) continue;
    if (onPolygon(s.a, layout.frame) && onPolygon(s.b, layout.frame)) continue;
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 4) continue;
    if (layout.decorNails.some((n) => Math.hypot(n.x - s.a.x, n.y + 1 - s.a.y) < 0.5)) continue; // 道釘の下の線分
    // 入賞口の柱は chucker() で描く
    const nearChucker = (p: Vec) =>
      Math.hypot(p.x - layout.heso.x, p.y - layout.heso.y) < 16 ||
      layout.sensors.some((q) => q.kind === "pocket" && Math.abs(p.x - (q.x0 + q.x1) / 2) < 10 && Math.abs(p.y - q.y0) < 14);
    if (nearChucker(s.a) && nearChucker(s.b)) continue;
    group.add(plate(s.a, s.b, 2.2, 11, m.chrome));
  }

  // ---- センター役物（枠）
  const frameShape = new THREE.Shape(layout.frame.map((p) => new THREE.Vector2(p.x, p.y)));
  frameShape.holes.push(new THREE.Path(frameInner.map((p) => new THREE.Vector2(p.x, p.y))));
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: FRAME_DEPTH - 3,
    bevelEnabled: true,
    bevelThickness: 3,
    bevelSize: 2,
    bevelSegments: 3,
    curveSegments: 4,
  });
  const frame = new THREE.Mesh(frameGeo, m.pearl);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);
  // 縁取りの金
  const trim = tube(layout.frame, 1.6, FRAME_DEPTH + 0.4, true, m.gold);
  group.add(trim);
  // 枠の LED
  const frameLed = m.led.clone();
  frameLed.emissive = new THREE.Color(0xffc24a);
  group.add(tube(insetPolygon(layout.frame, 3.5), 1.4, FRAME_DEPTH + 0.6, true, frameLed));

  // ---- 液晶の奥の背板
  const back = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(frameInner.map((p) => new THREE.Vector2(p.x, p.y)))),
    new THREE.MeshStandardMaterial({ color: 0x140f2a, roughness: 0.8 }),
  );
  back.position.z = LCD_Z - 4;
  group.add(back);

  // ---- ステージ（液晶の手前の棚）
  const stageLed = m.led.clone();
  stageLed.emissive = new THREE.Color(0x66e0ff);
  const floor = layout.stageFloor;
  const half = floor.length / 2;
  const bottom = Math.min(...frameInner.map((p) => p.y));
  for (const part of [floor.slice(0, half), floor.slice(half)]) {
    const pts = [...part, { x: part[part.length - 1].x, y: bottom }, { x: part[0].x, y: bottom }];
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: FRAME_DEPTH - LCD_Z - 4, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, m.acrylic);
    mesh.position.z = LCD_Z;
    group.add(mesh);
    group.add(tube(part, 0.9, FRAME_DEPTH - 3.2, false, stageLed));
  }

  // ---- ワープの入口
  const warp = layout.sensors.find((s) => s.kind === "warp")!;
  const warpLamp = lampMat(0x66f0ff);
  const warpMesh = new THREE.Mesh(new THREE.BoxGeometry(warp.x1 - warp.x0 + 3, warp.y1 - warp.y0, 1.5), warpLamp);
  warpMesh.position.set((warp.x0 + warp.x1) / 2, (warp.y0 + warp.y1) / 2, FRAME_DEPTH + 0.8);
  group.add(warpMesh);

  // ---- ヘソ・一般入賞口（左右の柱 + 底 + ランプ）
  const hesoLamp = lampMat(0xffd34d);
  group.add(chucker(layout.heso.x, layout.heso.y, 8.2, m.plasticYellow, hesoLamp));
  const pocketLamp = lampMat(0xff7ab6);
  for (const s of layout.sensors) {
    if (s.kind === "pocket") group.add(chucker((s.x0 + s.x1) / 2, s.y0 + 6, 7.5, m.plasticPink, pocketLamp));
  }

  // ---- ゲート（通ると光る輪）
  const gate = layout.sensors.find((s) => s.kind === "gate")!;
  const gateLamp = lampMat(0x66f0ff);
  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(11, 1.2, 8, 32), gateLamp);
  gateRing.position.set((gate.x0 + gate.x1) / 2, (gate.y0 + gate.y1) / 2, 0.8);
  group.add(gateRing);

  // ---- 電チュー: 2 枚の羽根が外へ開く
  const denchuLamp = lampMat(0x66f0ff);
  const wingGeo = new THREE.BoxGeometry(2.4, 18, 11).translate(0, 9, 5.5);
  const denchuWings = [150, 170].map((x) => {
    const w = new THREE.Mesh(wingGeo, m.plasticCyan);
    w.position.set(x, -54, 0);
    w.castShadow = true;
    group.add(w);
    return w;
  });
  const roof = new THREE.Group();
  roof.add(plate({ x: 148, y: -40 }, { x: 160, y: -34 }, 2.2, 11, m.plasticCyan));
  roof.add(plate({ x: 160, y: -34 }, { x: 172, y: -40 }, 2.2, 11, m.plasticCyan));
  group.add(roof);
  const denchuBase = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 12), denchuLamp);
  denchuBase.position.set(160, -57, 6);
  group.add(denchuBase);

  // ---- アタッカー: 蓋が手前に倒れて開く。開くと中が赤く光る
  const lid = new THREE.Group();
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(58, 3, 12).translate(0, 0, 6), m.plasticPink);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  lid.position.set(145, -122.5, 0);
  lid.rotation.z = Math.atan2(21, 54);
  lid.rotation.order = "ZXY";
  group.add(lid);
  const attackerGlow = new THREE.MeshBasicMaterial({ color: 0xff3060, transparent: true, opacity: 0, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(54, 20), attackerGlow);
  glow.position.set(145, -138, 0.4);
  group.add(glow);

  // ---- 風車
  const windmills = layout.windmills.map((w) => {
    const star = new THREE.Shape();
    const n = 6;
    for (let i = 0; i <= n * 2; i++) {
      const r = i % 2 === 0 ? w.r : w.r * 0.42;
      const a = (i / (n * 2)) * Math.PI * 2;
      if (i === 0) star.moveTo(r * Math.cos(a), r * Math.sin(a));
      else star.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 3, bevelEnabled: false }), m.plasticPink);
    mesh.position.set(w.x, w.y, 9);
    mesh.castShadow = true;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 9, 8).rotateX(Math.PI / 2).translate(0, 0, 4.5), m.gold);
    axle.position.set(w.x, w.y, 0);
    group.add(mesh, axle);
    return mesh;
  });

  return {
    group,
    boardMat,
    frameInner,
    denchuWings,
    denchuRoof: roof,
    attackerLid: lid,
    attackerGlow,
    windmills,
    lamps: { heso: hesoLamp, gate: gateLamp, pocket: pocketLamp, warp: warpLamp, denchu: denchuLamp },
    frameLed,
    stageLed,
  };
}

/** ShapeGeometry の UV を盤面テクスチャの座標に合わせる */
function worldUv(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + ART_HALF) / (ART_HALF * 2), (pos.getY(i) + ART_HALF) / (ART_HALF * 2));
  }
  uv.needsUpdate = true;
}

function railArc(r0: number, r1: number, fromDeg: number, toDeg: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, deg(fromDeg), deg(toDeg), false);
  s.absarc(0, 0, r0, deg(toDeg), deg(fromDeg), true);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 12, bevelEnabled: false, curveSegments: 160 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function onPolygon(p: Vec, poly: Vec[]): boolean {
  return poly.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.01);
}

/** 線分 a-b に沿った板（厚み t、高さ h） */
function plate(a: Vec, b: Vec, t: number, h: number, mat: THREE.Material): THREE.Mesh {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len + t, t, h), mat);
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, h / 2);
  mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
  mesh.castShadow = true;
  return mesh;
}

function tube(points: Vec[], radius: number, z: number, closed: boolean, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, p.y, z)),
    closed,
    "catmullrom",
    0.1,
  );
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 12, radius, 8, closed), mat);
}

function lampMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0.4, roughness: 0.3 });
}

/** 入賞口: 左右の柱と底、手前下にランプ */
function chucker(x: number, y: number, halfW: number, mat: THREE.Material, lamp: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(2.4, 15, 12), mat);
    post.position.set(x + sx * halfW, y + 1.5, 6);
    post.castShadow = true;
    g.add(post);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 2.4, 2.4, 12), mat);
  base.position.set(x, y - 6, 6);
  g.add(base);
  const l = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 8, 5, 3), lamp);
  l.position.set(x, y - 10, 10);
  g.add(l);
  return g;
}
