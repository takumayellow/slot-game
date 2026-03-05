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

const spinBtn = document.getElementById("spin");
const betUpBtn = document.getElementById("betUp");
const betDownBtn = document.getElementById("betDown");
const resetBtn = document.getElementById("reset");

let spinning = false;

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
  charaLineEl.textContent = `ミケ「${text}」`;
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
      setCharacterLine("すごい！ 路地裏No.1の引きだね．");
    } else if (cherryCount >= 2) {
      setCharacterLine("チェリーの小当たり，流れは来てるよ．");
    } else {
      setCharacterLine("ナイス！ その調子で回そう．");
    }
  } else {
    setMessage("No Win... Try again.", false);
    if (engine.credit <= 10) {
      setCharacterLine("慎重にいこう，BETを1に下げるのがおすすめ．");
    } else {
      setCharacterLine("次で当たりを引こう，もう1回！．");
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
  setCharacterLine("リセット完了，ここから逆転しよう．");
  updatePanel();
});

fillPayTable();
updatePanel();
setMessage("Ready. Press SPIN.");
setCharacterLine("ネオン路地の営業スタートだよ．");
