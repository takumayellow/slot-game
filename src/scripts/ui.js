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

let spinning = false;
let speakerId = null;
let currentAudio = null;

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

async function initVoicevoxTsumugi() {
  try {
    const response = await fetch("http://127.0.0.1:50021/speakers");
    if (!response.ok) {
      throw new Error("speakers fetch failed");
    }

    const speakers = await response.json();
    const tsumugi = speakers.find((speaker) => speaker.name === "春日部つむぎ");
    if (!tsumugi || !tsumugi.styles || tsumugi.styles.length === 0) {
      throw new Error("tsumugi speaker not found");
    }

    const normalStyle = tsumugi.styles.find((style) => style.name === "ノーマル");
    speakerId = (normalStyle ?? tsumugi.styles[0]).id;
    setVoiceState(`春日部つむぎ (style ${speakerId})`);
  } catch (_error) {
    speakerId = null;
    setVoiceState("VOICEVOX未接続");
  }
}

async function speak(text) {
  if (!speakerId) {
    return;
  }

  try {
    const queryResponse = await fetch(
      `http://127.0.0.1:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: "POST" },
    );
    if (!queryResponse.ok) {
      throw new Error("audio_query failed");
    }

    const query = await queryResponse.json();
    query.speedScale = 1.08;
    query.pitchScale = 0.02;
    query.intonationScale = 1.18;
    query.volumeScale = 1.1;

    const synthResponse = await fetch(`http://127.0.0.1:50021/synthesis?speaker=${speakerId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(query),
    });
    if (!synthResponse.ok) {
      throw new Error("synthesis failed");
    }

    const audioBlob = await synthResponse.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) {
        currentAudio = null;
      }
    });
    await audio.play();
  } catch (_error) {
    setVoiceState("VOICEVOX読み上げ失敗");
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

  if (amount >= 50) {
    jackpotBannerEl.classList.remove("show");
    void jackpotBannerEl.offsetWidth;
    jackpotBannerEl.classList.add("show");
    jackpotBannerEl.textContent = amount >= 100 ? "MEGA WIN!" : "BIG WIN!";
    setTimeout(() => {
      jackpotBannerEl.classList.remove("show");
    }, 1050);
  }
}

async function animateAndSet(finalSymbols) {
  const frames = 16;
  for (let i = 0; i < frames; i += 1) {
    reelEls.forEach((element) => {
      element.textContent = randomIcon();
    });
    await new Promise((resolve) => setTimeout(resolve, 45));
  }

  finalSymbols.forEach((symbol, index) => {
    reelEls[index].textContent = symbol.icon;
  });
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
  setMessage("Spinning...", false);

  await animateAndSet(result.reels);

  spinning = false;
  updatePanel();

  if (result.win > 0) {
    setMessage(`${result.reason} +${result.win}`, true);
    triggerWinEffect(result.win);
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
    setMessage("No Win... Try again.", false);
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
  setMessage("Reset complete.");
  setCharacterLine("リセット完了．ここから逆転しよう．");
  void speak("リセット完了．ここから逆転しよう．");
  updatePanel();
});

fillPayTable();
updatePanel();
setMessage("Ready. Press SPIN.");
setCharacterLine("赤い台で勝負開始だよ．");
void initVoicevoxTsumugi();
