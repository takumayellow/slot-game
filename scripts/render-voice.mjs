/**
 * 演出のボイスを VOICEVOX（春日部つむぎ）で書き出す。生成済みの mp3 を同梱するので、
 * 公開後のサイトは VOICEVOX に依存しない。
 *   node scripts/render-voice.mjs <VOICEVOX エンジンの URL>
 * ffmpeg が PATH にあること。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENGINE = process.argv[2] ?? "http://127.0.0.1:50021";
const SPEAKER = 8; // 春日部つむぎ ノーマル
const OUT = "public/assets/voice";

/** id: 台詞。id は src/audio/audio.ts の VoiceId と対応する */
const LINES = {
  welcome: ["つむぎパチンコへ、ようこそ！", 1.0],
  reach: ["リーチ！", 1.1],
  next: ["ネクスト！", 1.15],
  cutinBlue: ["チャンスだよ！", 1.05],
  cutinRed: ["これ、熱いよ！", 1.05],
  cutinGold: ["きたきたきたー！", 1.15],
  sp: ["つむぎリーチ、いっくよー！", 1.05],
  spsp: ["最終決戦！ぜったい当てるんだから！", 1.05],
  push: ["ボタンを押して！", 1.1],
  hit: ["当たりー！やったぁ！", 1.1],
  miss: ["うそー、惜しかったのに", 1.0],
  sudden: ["えっ、当たってる！？", 1.15],
  zenkaiten: ["全回転！？すごすぎ！", 1.1],
  rightShoot: ["右打ちしてね！", 1.05],
  round: ["どんどん入れちゃお！", 1.05],
  rush: ["つむぎラッシュ、突入！", 1.1],
  promote: ["まだ終わらないよ！ラッシュ昇格！", 1.1],
  jitan: ["チャンスタイム！引き戻そ！", 1.05],
  lt: ["極・つむぎラッシュ！最高すぎ！", 1.1],
  rushHit: ["まだまだ続くよ！", 1.1],
  rushEnd: ["おつかれさま。また遊ぼうね", 1.0],
  leftShoot: ["左打ちに戻してね", 1.0],
};

async function synth(text, speed) {
  const q = await fetch(`${ENGINE}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`, { method: "POST" });
  if (!q.ok) throw new Error(`audio_query ${q.status}: ${text}`);
  const query = await q.json();
  query.speedScale = speed;
  query.intonationScale = 1.25;
  query.volumeScale = 1.2;
  query.prePhonemeLength = 0.02;
  query.postPhonemeLength = 0.08;
  const s = await fetch(`${ENGINE}/synthesis?speaker=${SPEAKER}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis ${s.status}: ${text}`);
  return Buffer.from(await s.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });
for (const [id, [text, speed]] of Object.entries(LINES)) {
  const wav = join(OUT, `${id}.wav`);
  writeFileSync(wav, await synth(text, speed));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", join(OUT, `${id}.mp3`)]);
  rmSync(wav);
  console.log(`${id}: ${text}`);
}
