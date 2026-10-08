import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Mode } from "../game/spec";
import { BALL_R, BOARD_R, type BoardLayout } from "../sim/board";
import type { Ball } from "../sim/physics";
import { GLASS_Z, LCD_RECT, LCD_Z, buildBoard3d, type BoardParts } from "./board3d";
import { CABINET, buildCabinet, trayBallPositions, type CabinetParts } from "./cabinet3d";
import { buildEmblem, type Emblem } from "./emblem";
import { makeMaterials } from "./materials";

/** 3D の台。物理と台の状態を受け取って毎フレーム描く */

export type LampName = "heso" | "gate" | "pocket" | "warp" | "denchu";

/** LED の雰囲気 */
export type LedTheme = "normal" | "reach" | "sp" | "jitan" | "rush" | "lt" | "jackpot";

export interface ViewFrame {
  now: number;
  dt: number;
  balls: readonly Ball[];
  windmillAngle: readonly number[];
  denchuOpen: boolean;
  attackerOpen: boolean;
  theme: LedTheme;
  /** ハンドルの回し具合 0..1 */
  handle: number;
  pushReady: boolean;
  trayBalls: number;
  status: StatusLeds;
}

export interface StatusLeds {
  holds1: number;
  holds2: number;
  mode: Mode;
  spinning: boolean;
  futoHit: boolean;
}

const MAX_BALLS = 72;

export class View {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly board: BoardParts;
  private readonly cab: CabinetParts;
  private readonly emblem: Emblem;
  private readonly lcdTex: THREE.CanvasTexture;
  private readonly ballMesh: THREE.InstancedMesh;
  private readonly lampLevel: Record<LampName, number> = { heso: 0, gate: 0, pocket: 0, warp: 0, denchu: 0 };
  private readonly lampBase: Record<LampName, number> = { heso: 0.5, gate: 0.4, pocket: 0.35, warp: 0.6, denchu: 0.5 };
  private readonly m = makeMaterials();
  private wingOpen = 0;
  private lidOpen = 0;
  private pushDown = 0;
  private shake = 0;
  private zoom = false;
  private pointer = new THREE.Vector2();
  private lastTray = -1;
  private statusT = 0;
  private readonly tmp = new THREE.Matrix4();

  constructor(
    private readonly host: HTMLElement,
    layout: BoardLayout,
    artCanvas: HTMLCanvasElement,
    lcdCanvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    this.scene.background = new THREE.Color(0x07040f);
    pmrem.dispose();

    // 光: 天井の照明（影を落とす）+ 弱い環境光
    const sun = new THREE.DirectionalLight(0xfff1e0, 1.35);
    sun.position.set(-260, 520, 900);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -320;
    sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 360;
    sun.shadow.camera.bottom = -460;
    sun.shadow.camera.near = 200;
    sun.shadow.camera.far = 2000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfb4ff, 0x20102a, 0.35));

    const art = new THREE.CanvasTexture(artCanvas);
    art.colorSpace = THREE.SRGBColorSpace;
    art.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.board = buildBoard3d(layout, this.m, art);
    this.scene.add(this.board.group);

    this.cab = buildCabinet(this.m);
    this.scene.add(this.cab.group);

    // 液晶
    this.lcdTex = new THREE.CanvasTexture(lcdCanvas);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    this.lcdTex.anisotropy = 4;
    const lcd = new THREE.Mesh(
      new THREE.PlaneGeometry(LCD_RECT.x1 - LCD_RECT.x0, LCD_RECT.y1 - LCD_RECT.y0),
      new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) }),
    );
    lcd.position.set((LCD_RECT.x0 + LCD_RECT.x1) / 2, (LCD_RECT.y0 + LCD_RECT.y1) / 2, LCD_Z);
    this.scene.add(lcd);

    // 可動役物（液晶の上に隠れていて、熱い場面で落ちてくる）
    this.emblem = buildEmblem(this.m);
    this.scene.add(this.emblem.group);

    // ガラス
    const glass = new THREE.Mesh(new THREE.CircleGeometry(BOARD_R + 14, 96), this.m.glass);
    glass.position.z = GLASS_Z;
    glass.renderOrder = 10;
    this.scene.add(glass);

    this.ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.m.ball, MAX_BALLS);
    this.ballMesh.castShadow = true;
    this.ballMesh.count = 0;
    this.ballMesh.frustumCulled = false;
    this.scene.add(this.ballMesh);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
    this.resize();
  }

  setZoom(on: boolean): void {
    this.zoom = on;
    this.placeCamera(0);
  }

  get zoomed(): boolean {
    return this.zoom;
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placeCamera(0);
  }

  flashLamp(name: LampName): void {
    this.lampLevel[name] = 1;
  }

  /** 画面を揺らす（大当たり・役物落下） */
  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  dropEmblem(now: number): void {
    this.emblem.drop(now);
    this.kick(5);
  }

  pressPush(): void {
    this.pushDown = 1;
  }

  update(f: ViewFrame): void {
    const dt = Math.min(f.dt, 0.1);
    this.lcdTex.needsUpdate = true;
    this.updateBalls(f.balls);
    this.updateGimmicks(f, dt);
    this.updateLeds(f, dt);
    this.updateCabinet(f, dt);
    this.emblem.update(f.now);
    this.shake *= Math.exp(-dt * 7);
    this.placeCamera(f.now);
  }

  render(): void {
    this.composer.render();
  }

  private placeCamera(now: number): void {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const box = this.zoom ? ZOOM_BOX : CABINET_BOX;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const halfH = ((box.y1 - box.y0) / 2) * 1.04;
    const halfW = ((box.x1 - box.x0) / 2) * 1.04;
    const t = Math.tan(fov / 2);
    const d = Math.max(halfH / t, halfW / (t * this.camera.aspect)) + (this.zoom ? 0 : 40);
    const sx = this.shake * (Math.sin(now * 61) + Math.sin(now * 37) * 0.5);
    const sy = this.shake * (Math.cos(now * 53) + Math.sin(now * 29) * 0.5);
    // 少し下から見上げる。マウスで視点がわずかに動く
    this.camera.position.set(cx + this.pointer.x * 30 + sx, cy - d * 0.06 - this.pointer.y * 20 + sy, d);
    this.camera.lookAt(cx + sx * 0.5, cy + sy * 0.5, 0);
  }

  private updateBalls(balls: readonly Ball[]): void {
    const n = Math.min(balls.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      const z = b.layer === "stage" ? 2 : BALL_R + 0.3;
      this.ballMesh.setMatrixAt(i, this.tmp.makeTranslation(b.x, b.y, z));
    }
    this.ballMesh.count = n;
    this.ballMesh.instanceMatrix.needsUpdate = true;
  }

  private updateGimmicks(f: ViewFrame, dt: number): void {
    const b = this.board;
    // 電チューの羽根は素早く開閉する
    this.wingOpen = approach(this.wingOpen, f.denchuOpen ? 1 : 0, dt * 14);
    const a = 0.5 * this.wingOpen;
    b.denchuWings[0].rotation.z = a;
    b.denchuWings[1].rotation.z = -a;
    b.denchuRoof.visible = this.wingOpen < 0.5;
    // アタッカーの蓋は手前に倒れる
    this.lidOpen = approach(this.lidOpen, f.attackerOpen ? 1 : 0, dt * 6);
    b.attackerLid.rotation.x = THREE.MathUtils.degToRad(78) * this.lidOpen;
    b.attackerGlow.opacity = this.lidOpen * (0.55 + 0.3 * Math.sin(f.now * 12));
    b.windmills.forEach((w, i) => (w.rotation.z = f.windmillAngle[i] ?? 0));

    for (const k of Object.keys(this.lampLevel) as LampName[]) {
      this.lampLevel[k] *= Math.exp(-dt * 5);
      let base = this.lampBase[k];
      if (k === "denchu" && f.denchuOpen) base = 2.5;
      b.lamps[k].emissiveIntensity = base + this.lampLevel[k] * 4;
    }
  }

  private updateLeds(f: ViewFrame, dt: number): void {
    const { color, speed, intensity } = ledLook(f.theme, f.now);
    const leds = [this.cab.ringLed, this.cab.sideLed, this.board.frameLed];
    for (const mat of leds) {
      mat.emissive.copy(color);
      mat.emissiveIntensity = intensity;
      if (mat.emissiveMap) mat.emissiveMap.offset.x -= speed * dt;
    }
    const stage = f.theme === "jackpot" || f.theme === "lt" ? color : STAGE_CYAN;
    this.board.stageLed.emissive.copy(stage);
    this.cab.crownMat.emissiveIntensity = 1.2 + (f.theme === "jackpot" ? 0.6 * Math.sin(f.now * 10) : 0.15 * Math.sin(f.now * 2));
  }

  private updateCabinet(f: ViewFrame, dt: number): void {
    const c = this.cab;
    c.handle.rotation.z = -f.handle * 1.8;
    this.pushDown = Math.max(0, this.pushDown - dt * 5);
    c.pushButton.position.z = (c.pushButton.userData.baseZ as number) - this.pushDown * 8;
    c.pushMat.emissiveIntensity = f.pushReady ? 1.6 + 1.4 * Math.sin(f.now * 16) : 0.5;
    c.pushMat.emissive.set(f.pushReady ? 0xff2050 : 0xff2d6a);

    if (f.trayBalls !== this.lastTray) {
      const pos = trayBallPositions(f.trayBalls);
      pos.forEach((p, i) => c.trayBalls.setMatrixAt(i, this.tmp.makeTranslation(p.x, p.y, p.z)));
      c.trayBalls.count = pos.length;
      c.trayBalls.instanceMatrix.needsUpdate = true;
      this.lastTray = f.trayBalls;
    }

    this.statusT -= dt;
    if (this.statusT <= 0) {
      this.statusT = 0.1;
      drawStatus(c.statusCanvas, f.status, f.now);
      c.statusTex.needsUpdate = true;
    }
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

const HSL = new THREE.Color();
const STAGE_CYAN = new THREE.Color(0x66e0ff);
/** カメラに収める範囲（拡大時は盤面だけ） */
const ZOOM_BOX = { x0: -245, x1: 245, y0: -245, y1: 245 };
const CABINET_BOX = { ...CABINET, y0: CABINET.y0 + 10 };

function ledLook(theme: LedTheme, t: number): { color: THREE.Color; speed: number; intensity: number } {
  switch (theme) {
    case "reach":
      return { color: HSL.set(0xff2a3a), speed: 1.4, intensity: 2.6 + Math.sin(t * 18) };
    case "sp":
      return { color: HSL.setHSL((0.95 + 0.05 * Math.sin(t * 6)) % 1, 1, 0.55), speed: 2.2, intensity: 3 + Math.sin(t * 24) * 1.2 };
    case "jitan":
      return { color: HSL.set(0x35ffa0), speed: 0.5, intensity: 2.2 };
    case "rush":
      return { color: HSL.set(Math.sin(t * 3) > 0 ? 0xff4fae : 0x4fe6ff), speed: 1.0, intensity: 2.6 };
    case "lt":
      return { color: HSL.setHSL((t * 0.25) % 1, 1, 0.6), speed: 1.6, intensity: 3 };
    case "jackpot":
      return { color: HSL.setHSL((t * 0.6) % 1, 1, 0.6), speed: 2.4, intensity: 3.4 };
    default:
      return { color: HSL.set(0xffc24a), speed: 0.25, intensity: 1.8 };
  }
}

/** 主基板の表示（特図・普図・保留ランプ） */
function drawStatus(c: HTMLCanvasElement, s: StatusLeds, t: number): void {
  const g = c.getContext("2d")!;
  g.fillStyle = "#050308";
  g.fillRect(0, 0, c.width, c.height);
  g.font = "bold 18px sans-serif";
  g.textBaseline = "middle";
  const dot = (x: number, y: number, on: boolean, color: string) => {
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fillStyle = on ? color : "#1c1820";
    g.fill();
  };
  g.fillStyle = "#8a8296";
  g.fillText("特1", 8, 22);
  g.fillText("特2", 8, 52);
  g.fillText("普", 8, 80);
  for (let i = 0; i < 4; i++) {
    dot(64 + i * 22, 22, i < s.holds1, "#ff3a3a");
    dot(64 + i * 22, 52, i < s.holds2, "#ff3a3a");
  }
  // 特図の変動中は 7 セグが回る
  g.fillStyle = s.spinning ? `hsl(${(t * 600) % 360}, 90%, 60%)` : "#ffb02a";
  g.font = "bold 40px monospace";
  g.fillText(s.spinning ? String(Math.floor(t * 20) % 10) : "-", 170, 36);
  g.font = "bold 18px sans-serif";
  dot(64, 80, s.futoHit, "#3aff7a");
  dot(160, 80, s.mode === "rush" || s.mode === "lt", "#ff3ab0");
  dot(184, 80, s.mode !== "normal", "#3ab0ff");
}
