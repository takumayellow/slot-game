/** 効果音を Web Audio で合成する小さな部品 */

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
}

let noiseBuf: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** 終わりの周波数（スイープ） */
  to?: number;
  dur: number;
  gain: number;
  attack?: number;
  at?: number;
  detune?: number;
}

/** エンベロープ付きの単音 */
export function tone(v: Voice, o: ToneOpts): void {
  const { ctx } = v;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(v.out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

export interface NoiseOpts {
  dur: number;
  gain: number;
  /** バンドパスの中心周波数 */
  freq: number;
  to?: number;
  q?: number;
  at?: number;
  attack?: number;
}

/** フィルタを通した雑音（打撃音・風切り音） */
export function hiss(v: Voice, o: NoiseOpts): void {
  const { ctx } = v;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(v.out);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.02);
}

/** 音名の半音番号から周波数（69 = A4） */
export function midi(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

/** 和音を一斉に鳴らす */
export function chord(v: Voice, notes: number[], o: Omit<ToneOpts, "freq">): void {
  for (const n of notes) tone(v, { ...o, freq: midi(n), gain: o.gain / Math.sqrt(notes.length) });
}
