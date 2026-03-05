import { SlotEngine, SYMBOLS, RULES } from "./engine.js";

const engine = new SlotEngine();

const reelEls = [
  document.getElementById("reel-0"),
  document.getElementById("reel-1"),
  document.getElementById("reel-2"),
];

const creditEl = document.getElementById("credit");
const betEl = document.getElementById("bet");
const lastWinEl = document.getElementById("lastWin");
const messageEl = document.getElementById("message");
const payTableEl = document.getElementById("payTable");
const charaLineEl = document.getElementById("charaLine");
const winFxEl = document.getElementById("winFx");
const jackpotBannerEl = document.getElementById("jackpotBanner");
const voiceStateEl = document.getElementById("voiceState");

const spinBtn = document.getElementById("spin");
const betUpBtn = document.getElementById("betUp");
const betDownBtn = document.getElementById("betDown");
const resetBtn = document.getElementById("reset");
const voiceTestBtn = document.getElementById("voiceTest");

let spinning = false;
let speakerId = null;
let currentAudio = null;
const query = new URLSearchParams(window.location.search);
const explicitVoiceApi = query.get("voiceApi"); // e.g. https://your-api.example.com/voicevox
const VOICEVOX_URL = explicitVoiceApi || "/voicevox";
const TARGET_SPEAKER_NAME = "春日部つむぎ";
let audioCtx = null;

function randomIcon() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].icon;
}

function updatePanel() {
  creditEl.textContent = String(engine.credit);
  betEl.textContent = String(engine.bet);
  lastWinEl.textContent = String(engine.lastWin);

  const disabled = spinning || !engine.canSpin();
  spinBtn.disabled = disabled;
  betUpBtn.disabled = spinning || engine.bet >= RULES.maxBet;
  betDownBtn.disabled = spinning || engine.bet <= RULES.minBet;
}

function setMessage(text, isWin = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("win", isWin);
}

function setCharacterLine(text) {
  charaLineEl.textContent = `つむぎ「${text}」`;
}

function setVoiceState(text) {
  voiceStateEl.textContent = `読み上げ: ${text}`;
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
}

function playReelStopSound() {
  try {
    ensureAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(110, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(68, audioCtx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.11);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (_error) {
    // ignore audio errors
  }
}

function playJackpotSound() {
  try {
    ensureAudioContext();
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + index * 0.07;
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  } catch (_error) {
    // ignore audio errors
  }
}

async function initVoicevoxTsumugi() {
  if (window.location.protocol === "https:" && !explicitVoiceApi) {
    speakerId = null;
    setVoiceState("VOICEVOX未接続（URLに ?voiceApi=https://<proxy>/voicevox を指定）");
    return false;
  }

  try {
    const response = await fetch(`${VOICEVOX_URL}/speakers`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const speakers = await response.json();
    const tsumugi = speakers.find((speaker) => speaker.name === TARGET_SPEAKER_NAME);
    if (!tsumugi || !tsumugi.styles || tsumugi.styles.length === 0) {
      throw new Error(`${TARGET_SPEAKER_NAME} が見つかりません`);
    }

    const normal = tsumugi.styles.find((style) => style.name === "ノーマル");
    speakerId = (normal ?? tsumugi.styles[0]).id;
    setVoiceState(`VOICEVOX ${TARGET_SPEAKER_NAME} (speaker=${speakerId})`);
    return true;
  } catch (error) {
    speakerId = null;
    const reason = error instanceof Error ? error.message : "unknown";
    setVoiceState(`VOICEVOX未接続 (${VOICEVOX_URL}, ${reason})`);
    return false;
  }
}

async function playAudioFromUrl(url) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const audio = new Audio(url);
  currentAudio = audio;
  if (url.startsWith("blob:")) {
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
    });
  }
  await audio.play();
}

async function speak(text) {
  if (!speakerId) {
    const connected = await initVoicevoxTsumugi();
    if (!connected) {
      return;
    }
  }

  try {
    const queryResponse = await fetch(
      `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: "POST" },
    );
    if (!queryResponse.ok) {
      throw new Error(`audio_query ${queryResponse.status}`);
    }
    const audioQuery = await queryResponse.json();
    audioQuery.speedScale = 1.06;
    audioQuery.pitchScale = 0.02;
    audioQuery.intonationScale = 1.2;
    audioQuery.volumeScale = 1.2;

    const synthResponse = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${speakerId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(audioQuery),
    });
    if (!synthResponse.ok) {
      throw new Error(`synthesis ${synthResponse.status}`);
    }

    const blob = await synthResponse.blob();
    const url = URL.createObjectURL(blob);
    await playAudioFromUrl(url);
    setVoiceState(`VOICEVOX ${TARGET_SPEAKER_NAME} (speaker=${speakerId})`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    setVoiceState(`VOICEVOX読み上げ失敗: ${reason}`);
  }
}

function fillPayTable() {
  const items = [...SYMBOLS]
    .sort((a, b) => b.payout - a.payout)
    .map((symbol) => `<li><span>${symbol.icon}x3</span><strong>${symbol.payout}xBET</strong></li>`)
    .join("");
  payTableEl.innerHTML = `${items}<li><span>🍒x2</span><strong>${RULES.cherryPairMultiplier}xBET</strong></li>`;
}

function triggerWinEffect(amount) {
  winFxEl.classList.remove("active");
  void winFxEl.offsetWidth;
  winFxEl.classList.add("active");

  for (let i = 0; i < 28; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${Math.random() * 100}%`;
    spark.style.top = `${58 + Math.random() * 25}%`;
    spark.style.color = ["#ffe066", "#ff9f1a", "#f7f7ff", "#77e5ff"][i % 4];
    spark.style.setProperty("--move-x", `${(Math.random() - 0.5) * 240}px`);
    spark.style.setProperty("--move-y", `${-70 - Math.random() * 240}px`);
    spark.style.animationDelay = `${Math.random() * 120}ms`;
    winFxEl.appendChild(spark);
  }

  document.body.classList.add("win-mode");
  reelEls.forEach((reel) => reel.classList.add("win-pop"));

  setTimeout(() => {
    reelEls.forEach((reel) => reel.classList.remove("win-pop"));
    document.body.classList.remove("win-mode");
    winFxEl.classList.remove("active");
    winFxEl.innerHTML = "";
  }, 900);

}

function showResultPopup(isWin, amount = 0) {
  jackpotBannerEl.classList.remove("show", "lose");
  void jackpotBannerEl.offsetWidth;

  if (isWin) {
    jackpotBannerEl.textContent = amount >= 100 ? "超大当たり！" : "当たり！";
    playJackpotSound();
  } else {
    jackpotBannerEl.textContent = "はずれ";
    jackpotBannerEl.classList.add("lose");
  }

  jackpotBannerEl.classList.add("show");
  setTimeout(() => {
    jackpotBannerEl.classList.remove("show", "lose");
  }, 1050);
}

async function animateAndSet(finalSymbols) {
  const baseSpinMs = 460;
  const stopDelayMs = 260;
  const frameMs = 42;

  const spinOneReel = (reelIndex, stopSymbol, totalMs) =>
    new Promise((resolve) => {
      const reel = reelEls[reelIndex];
      const timer = setInterval(() => {
        reel.textContent = randomIcon();
      }, frameMs);

      setTimeout(() => {
        clearInterval(timer);
        reel.textContent = stopSymbol.icon;
        playReelStopSound();
        reel.classList.remove("win-pop");
        reel.classList.add("win-pop");
        setTimeout(() => reel.classList.remove("win-pop"), 180);
        resolve();
      }, totalMs);
    });

  await spinOneReel(0, finalSymbols[0], baseSpinMs);
  await spinOneReel(1, finalSymbols[1], baseSpinMs + stopDelayMs);
  await spinOneReel(2, finalSymbols[2], baseSpinMs + stopDelayMs * 2);
}

async function onSpin() {
  if (spinning) {
    return;
  }

  const result = engine.spin();
  if (!result.success) {
    setMessage(result.error, false);
    setCharacterLine("ベットを下げるか，RESETで再開しよう．");
    updatePanel();
    return;
  }

  spinning = true;
  updatePanel();
  setMessage("回転中...", false);

  await animateAndSet(result.reels);

  spinning = false;
  updatePanel();

  if (result.win > 0) {
    setMessage(`${result.reason} +${result.win}枚`, true);
    triggerWinEffect(result.win);
    showResultPopup(true, result.win);
    const cherryCount = result.reels.filter((symbol) => symbol.key === "CHERRY").length;
    if (result.win >= 100) {
      setCharacterLine("大当たり！ このまま連チャン狙おう．");
      void speak("大当たりだよ．このまま連チャン狙おう．");
    } else if (cherryCount >= 2) {
      setCharacterLine("小当たりだよ．次はもっと伸ばそう．");
      void speak("小当たりだよ．次はもっと伸ばそう．");
    } else {
      setCharacterLine("いい感じ！ まだまだいけるよ．");
      void speak("いい感じ．まだまだいけるよ．");
    }
  } else {
    setMessage("はずれ... もう1回！", false);
    showResultPopup(false);
    if (engine.credit <= 10) {
      setCharacterLine("いったんベットを下げて立て直そう．");
      void speak("いったんベットを下げて立て直そう．");
    } else {
      setCharacterLine("次で引こう．もう1回いこっ．");
      void speak("次で引こう．もう一回いこっ．");
    }
  }
}

spinBtn.addEventListener("click", onSpin);

betUpBtn.addEventListener("click", () => {
  engine.increaseBet();
  updatePanel();
});

betDownBtn.addEventListener("click", () => {
  engine.decreaseBet();
  updatePanel();
});

resetBtn.addEventListener("click", () => {
  engine.reset();
  reelEls[0].textContent = "🍒";
  reelEls[1].textContent = "🍋";
  reelEls[2].textContent = "🔔";
  setMessage("リセット完了．");
  setCharacterLine("リセット完了．ここから逆転しよう．");
  void speak("リセット完了．ここから逆転しよう．");
  updatePanel();
});

voiceTestBtn.addEventListener("click", async () => {
  setCharacterLine("音声テストするよ．");
  await speak("音声テストです．春日部つむぎで読み上げています．");
});

fillPayTable();
updatePanel();
setMessage("準備OK．SPINを押してスタート！");
setCharacterLine("赤い台で勝負開始だよ．");
void initVoicevoxTsumugi();
