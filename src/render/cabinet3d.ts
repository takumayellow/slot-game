import * as THREE from "three";
import { BALL_R } from "../sim/board";
import { FONT } from "./boardArt";
import type { Materials } from "./materials";

/** 台の外装（前面枠・LED・上皿・PUSH ボタン・ハンドル） */
export const CABINET = { x0: -282, x1: 282, y0: -430, y1: 330 };
const HOLE_R = 240;
const TRAY_TOP = -300;
const TRAY_Z = { z0: 34, z1: 104 };
export const TRAY_CAPACITY = 90;

export interface CabinetParts {
  group: THREE.Group;
  ringLed: THREE.MeshStandardMaterial;
  sideLed: THREE.MeshStandardMaterial;
  crownMat: THREE.MeshStandardMaterial;
  pushButton: THREE.Object3D;
  pushMat: THREE.MeshStandardMaterial;
  handle: THREE.Object3D;
  trayBalls: THREE.InstancedMesh;
  statusCanvas: HTMLCanvasElement;
  statusTex: THREE.CanvasTexture;
}

export function buildCabinet(m: Materials): CabinetParts {
  const group = new THREE.Group();

  // ---- 前面枠: 角丸の板に盤面の丸窓を抜く
  const outer = roundedRect(CABINET.x0, TRAY_TOP + 8, CABINET.x1, 268, 46);
  outer.holes.push(circlePath(0, 0, HOLE_R));
  const frame = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outer, { depth: 30, bevelEnabled: true, bevelThickness: 5, bevelSize: 4, bevelSegments: 4, curveSegments: 96 }),
    m.pearl,
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // 丸窓の縁: 金のリング + LED リング
  const lip = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 1.5, 3, 12, 160), m.gold);
  lip.position.z = 33;
  group.add(lip);
  const ringLed = m.led.clone();
  ringLed.emissiveMap = m.ledTex.clone();
  ringLed.emissiveMap.repeat.set(10, 1);
  ringLed.emissiveMap.needsUpdate = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 11, 3.4, 12, 200), ringLed);
  ring.position.z = 34;
  group.add(ring);

  // 左右の LED 柱
  const sideLed = m.led.clone();
  sideLed.emissiveMap = m.ledTex.clone();
  sideLed.emissiveMap.repeat.set(3, 1);
  sideLed.emissiveMap.needsUpdate = true;
  for (const sx of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(5, 300, 6, 12), sideLed);
    bar.position.set(sx * 266, 10, 33);
    group.add(bar);
  }

  // ---- 上部の看板
  const crownCanvas = document.createElement("canvas");
  crownCanvas.width = 1024;
  crownCanvas.height = 192;
  drawCrown(crownCanvas);
  const crownTex = new THREE.CanvasTexture(crownCanvas);
  crownTex.colorSpace = THREE.SRGBColorSpace;
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: crownTex,
    emissiveIntensity: 1.4,
    roughness: 0.6,
    envMapIntensity: 0.15,
  });
  const crownShape = roundedRect(-200, 262, 200, 330, 30);
  const crownGeo = new THREE.ExtrudeGeometry(crownShape, { depth: 22, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 3 });
  planarUv(crownGeo, -200, 262, 400, 68);
  const crown = new THREE.Mesh(crownGeo, [crownMat, m.gold]);
  crown.position.z = 12;
  group.add(crown);

  // ---- 下部: 上皿と操作部
  const lower = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(CABINET.x0, CABINET.y0, CABINET.x1, TRAY_TOP + 20, 30), {
      depth: TRAY_Z.z0,
      bevelEnabled: true,
      bevelThickness: 4,
      bevelSize: 3,
      bevelSegments: 3,
    }),
    m.darkMetal,
  );
  group.add(lower);
  // 上皿: 前に張り出した受け皿
  const tray = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(-250, TRAY_TOP - 52, 180, TRAY_TOP, 20), {
      depth: TRAY_Z.z1 - TRAY_Z.z0,
      bevelEnabled: true,
      bevelThickness: 6,
      bevelSize: 5,
      bevelSegments: 4,
    }),
    m.pearl,
  );
  tray.position.z = TRAY_Z.z0;
  tray.castShadow = true;
  tray.receiveShadow = true;
  group.add(tray);
  // 皿の溝（玉が溜まる所）
  const groove = new THREE.Mesh(new THREE.BoxGeometry(400, 2, 44), m.darkMetal);
  groove.position.set(-35, TRAY_TOP + 5, (TRAY_Z.z0 + TRAY_Z.z1) / 2);
  groove.receiveShadow = true;
  group.add(groove);
  const trayBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 20, 14), m.ball, TRAY_CAPACITY);
  trayBalls.castShadow = true;
  trayBalls.count = 0;
  group.add(trayBalls);

  // PUSH ボタン
  const pushButton = new THREE.Group();
  const pushMat = new THREE.MeshStandardMaterial({ color: 0x441020, emissive: 0xff2d6a, emissiveIntensity: 0.6, roughness: 0.25 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), pushMat);
  dome.scale.z = 0.55;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(31, 4, 12, 48), m.chrome);
  pushButton.add(dome, bezel);
  pushButton.position.set(70, TRAY_TOP - 26, TRAY_Z.z1 + 6);
  pushButton.userData.baseZ = pushButton.position.z;
  group.add(pushButton);

  // ハンドル
  const handle = new THREE.Group();
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 30, 40).rotateX(Math.PI / 2), m.chrome);
  handle.add(knob);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 32), m.darkMetal);
    grip.position.set(Math.cos(a) * 35, Math.sin(a) * 35, 0);
    handle.add(grip);
  }
  const lever = new THREE.Mesh(new THREE.BoxGeometry(12, 30, 10), m.gold);
  lever.position.set(0, 44, 6);
  handle.add(lever);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 4, 32).rotateX(Math.PI / 2), m.pearl);
  cap.position.z = 17;
  handle.add(cap);
  handle.position.set(222, -372, 64);
  group.add(handle);

  // 特図・普図の表示（主基板の LED。実機の盤面右下にある小さな表示部）
  const statusCanvas = document.createElement("canvas");
  statusCanvas.width = 256;
  statusCanvas.height = 96;
  const statusTex = new THREE.CanvasTexture(statusCanvas);
  statusTex.colorSpace = THREE.SRGBColorSpace;
  const status = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 36),
    new THREE.MeshBasicMaterial({ map: statusTex, toneMapped: false }),
  );
  status.position.set(-160, TRAY_TOP - 26, TRAY_Z.z1 + 5.2);
  group.add(status);

  return { group, ringLed, sideLed, crownMat, pushButton, pushMat, handle, trayBalls, statusCanvas, statusTex };
}

/** 上皿の玉の並び（手前から奥へ、右から左へ詰める） */
export function trayBallPositions(n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const cols = 30;
  for (let i = 0; i < Math.min(n, TRAY_CAPACITY); i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out.push(
      new THREE.Vector3(150 - col * (BALL_R * 2 + 0.6) - (row % 2) * BALL_R, TRAY_TOP + 6 + BALL_R + row * 2.2, TRAY_Z.z1 - 14 - row * 10),
    );
  }
  return out;
}

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function circlePath(x: number, y: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(x, y, r, 0, Math.PI * 2, true);
  return p;
}

function planarUv(geo: THREE.BufferGeometry, x0: number, y0: number, w: number, h: number): void {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / w, (pos.getY(i) - y0) / h);
  uv.needsUpdate = true;
}

function drawCrown(c: HTMLCanvasElement): void {
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, "#2b1450");
  bg.addColorStop(1, "#0c0620");
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `112px ${FONT}`;
  const grad = g.createLinearGradient(0, 30, 0, 160);
  grad.addColorStop(0, "#fff6c8");
  grad.addColorStop(0.5, "#ffc93c");
  grad.addColorStop(1, "#ff7a2f");
  g.lineWidth = 14;
  g.strokeStyle = "#5a1a6e";
  g.strokeText("Pつむぎ", c.width / 2, 92);
  g.fillStyle = grad;
  g.fillText("Pつむぎ", c.width / 2, 92);
  g.font = `30px ${FONT}`;
  g.fillStyle = "#9ff3ff";
  g.fillText("ST 1/39.9 ・ 1/99.9", c.width / 2, 166);
}
