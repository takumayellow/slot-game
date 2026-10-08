import * as THREE from "three";

/** 実機の部品の質感（真鍮の釘・クロームのレール・樹脂の役物） */
export function makeMaterials() {
  const ledTex = ledStripTexture();
  return {
    brass: new THREE.MeshStandardMaterial({ color: 0xe0bd72, metalness: 1, roughness: 0.26 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9f0, metalness: 1, roughness: 0.12 }),
    ball: new THREE.MeshStandardMaterial({ color: 0xf2f3f7, metalness: 1, roughness: 0.06 }),
    // 枠はパール塗装の濃い紫。白にすると照明で飽和して光彩が画面全体に滲む
    pearl: new THREE.MeshPhysicalMaterial({
      color: 0x3a2a66,
      metalness: 0.55,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xff8fd0),
    }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xf2c25a, metalness: 1, roughness: 0.22, clearcoat: 0.6 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x23202e, metalness: 0.7, roughness: 0.35 }),
    plasticPink: plastic(0xff6fae, 0.85),
    plasticCyan: plastic(0x5fe6ff, 0.75),
    plasticYellow: plastic(0xffd34d, 0.9),
    acrylic: new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      clearcoat: 1,
      emissive: 0x3a7cff,
      emissiveIntensity: 0.35,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    }),
    led: new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0xffffff,
      emissiveMap: ledTex,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
    ledTex,
  };
}

export type Materials = ReturnType<typeof makeMaterials>;

function plastic(color: number, opacity: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.18,
    clearcoat: 1,
    transparent: opacity < 1,
    opacity,
    emissive: color,
    emissiveIntensity: 0.25,
  });
}

/** LED の帯。明るい粒が並んだ模様を流してチェイスさせる */
function ledStripTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 4;
  const g = c.getContext("2d")!;
  g.fillStyle = "#202020";
  g.fillRect(0, 0, 256, 4);
  for (let i = 0; i < 16; i++) {
    const x = i * 16;
    const grad = g.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, "#303030");
    grad.addColorStop(0.5, i % 4 === 0 ? "#ffffff" : "#b0b0b0");
    grad.addColorStop(1, "#303030");
    g.fillStyle = grad;
    g.fillRect(x, 0, 16, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
