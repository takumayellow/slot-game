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
