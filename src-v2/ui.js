/**
 * ui.js - V2 Pachislot UI & Animation Controller
 * Handles all DOM interactions, reel animations, effects
 */

'use strict';

// ============================================================
// INITIALIZATION - Wait for DOM ready
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const engine = new window.SlotEngineV2();
  const audio = new window.PachislotAudioV2();
  const SYMBOLS = window.SlotSymbolsV2;
  const RULES = window.SlotRulesV2;

  // Symbol display map (key → emoji/label)
  const SYMBOL_DISPLAY = {};
  // Symbol name map (key → Japanese name)
  const SYMBOL_NAME = {};
  SYMBOLS.forEach(s => {
    SYMBOL_DISPLAY[s.key] = s.label;
    SYMBOL_NAME[s.key] = s.name;
  });

  // Symbol color class map
  const SYMBOL_COLOR = {
    'SEVEN': 'sym-seven',
    'BAR': 'sym-bar',
    'BELL': 'sym-bell',
    'WATERMELON': 'sym-watermelon',
    'CHERRY': 'sym-cherry',
    'GRAPE': 'sym-grape',
    'LEMON': 'sym-lemon',
  };

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const reelContainers = [
    document.getElementById('reel-0'),
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
  ];

  const creditDisplay = document.getElementById('credit-display');
  const betDisplay = document.getElementById('bet-display');
  const winDisplay = document.getElementById('win-display');
  const streakDisplay = document.getElementById('streak-display');
  const multiplierDisplay = document.getElementById('multiplier-display');
  const paylinesDisplay = document.getElementById('paylines-display');
  const freeSpinsDisplay = document.getElementById('freespins-display');
  const freeSpinsPanel = document.getElementById('freespins-panel');
  const messageEl = document.getElementById('message-display');
  const winBanner = document.getElementById('win-banner');
  const winBannerText = document.getElementById('win-banner-text');
  const sparkContainer = document.getElementById('spark-container');
  const paylineHighlights = document.querySelectorAll('.payline-indicator');

  const spinBtn = document.getElementById('btn-spin');
  const bet1Btn = document.getElementById('btn-bet1');
  const betMaxBtn = document.getElementById('btn-betmax');
  const muteBtn = document.getElementById('btn-mute');
  const resetBtn = document.getElementById('btn-reset');

  let spinning = false;
  let audioInitialized = false;

  // ============================================================
  // AUDIO INIT HELPER
  // ============================================================
  function ensureAudio() {
    if (!audioInitialized) {
      audio.init();
      audioInitialized = true;
    }
  }

  // ============================================================
  // DISPLAY HELPERS
  // ============================================================
  function updateDisplays() {
    // LED-style number display with leading zeros
    const fmt = (n, digits = 6) => String(n).padStart(digits, '0');
    creditDisplay.textContent = fmt(engine.credit);
    betDisplay.textContent = fmt(engine.bet, 1);
    winDisplay.textContent = fmt(engine.lastWin, 4);
    streakDisplay.textContent = engine.winStreak;

    const mult = engine.getStreakMultiplier();
    multiplierDisplay.textContent = `×${mult.toFixed(1)}`;
    multiplierDisplay.className = 'led-value';
    if (mult >= 3) multiplierDisplay.classList.add('mult-x3');
    else if (mult >= 2) multiplierDisplay.classList.add('mult-x2');
    else if (mult >= 1.5) multiplierDisplay.classList.add('mult-x1-5');

    const activeLines = engine.getActivePaylines();
    paylinesDisplay.textContent = `LINES: ${activeLines}`;

    // Free spin panel
    if (engine.isFreeSpinMode) {
      freeSpinsPanel.classList.add('active');
      freeSpinsDisplay.textContent = engine.freeSpinsLeft;
    } else {
      freeSpinsPanel.classList.remove('active');
    }

    // Button states
    spinBtn.disabled = spinning || !engine.canSpin();
    bet1Btn.disabled = spinning || engine.isFreeSpinMode;
    betMaxBtn.disabled = spinning || engine.isFreeSpinMode;

    // Payline indicators
    paylineHighlights.forEach((el, i) => {
      el.classList.toggle('active', i < activeLines);
    });
  }

  function setMessage(text, type = '') {
    messageEl.textContent = text;
    messageEl.className = 'message-display';
    if (type) messageEl.classList.add('msg-' + type);
  }

  // ============================================================
  // REEL RENDERING
  // ============================================================
  function renderReelWindow(reelIndex, symbols) {
    const container = reelContainers[reelIndex];
    const cells = container.querySelectorAll('.reel-cell');
    symbols.forEach((sym, row) => {
      const cell = cells[row];
      cell.textContent = sym.label;
      cell.className = 'reel-cell ' + (SYMBOL_COLOR[sym.key] || '');
      // Center row gets highlight class
      if (row === 1) cell.classList.add('center-row');
    });
  }

  function renderInitialReels() {
    const initSymbols = [
      [{ key: 'CHERRY', label: '🍒' }, { key: 'SEVEN', label: '7' }, { key: 'BELL', label: '🔔' }],
      [{ key: 'BELL', label: '🔔' }, { key: 'BAR', label: 'BAR' }, { key: 'LEMON', label: '🍋' }],
      [{ key: 'LEMON', label: '🍋' }, { key: 'WATERMELON', label: '🍉' }, { key: 'GRAPE', label: '🍇' }],
    ];
    reelContainers.forEach((_, i) => renderReelWindow(i, initSymbols[i]));
  }

  // ============================================================
  // REEL SPIN ANIMATION
  // ============================================================
  function getRandomSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  function animateReel(reelIndex, finalSymbols, totalDuration) {
    return new Promise(resolve => {
      const container = reelContainers[reelIndex];
      const cells = container.querySelectorAll('.reel-cell');
      container.classList.add('spinning');

      const frameInterval = 50; // ms between frames while spinning
      let elapsed = 0;

      const interval = setInterval(() => {
        elapsed += frameInterval;
        // Show random symbols while spinning
        cells.forEach((cell, row) => {
          const sym = getRandomSymbol();
          cell.textContent = sym.label;
          const centerClass = row === 1 ? 'center-row center-row-marker' : '';
          cell.className = ['reel-cell', 'spinning-frame', centerClass, SYMBOL_COLOR[sym.key]].filter(Boolean).join(' ');
        });

        if (elapsed >= totalDuration) {
          clearInterval(interval);
          container.classList.remove('spinning');

          // Set final symbols
          finalSymbols.forEach((sym, row) => {
            const cell = cells[row];
            cell.textContent = sym.label;
            cell.className = 'reel-cell stop-pop ' + (SYMBOL_COLOR[sym.key] || '');
            if (row === 1) cell.classList.add('center-row');
          });

          // Play reel stop sound
          audio.playReelStop(reelIndex);

          // Remove pop animation class after it plays
          setTimeout(() => {
            cells.forEach(c => c.classList.remove('stop-pop'));
          }, 300);

          resolve();
        }
      }, frameInterval);
    });
  }

  async function animateAllReels(reelWindows) {
    const baseTime = 600;
    const stagger = 300;

    // Start all reels spinning with staggered stops
    const promises = reelWindows.map((symbols, i) =>
      animateReel(i, symbols, baseTime + stagger * i)
    );
    await Promise.all(promises);
  }

  // ============================================================
  // WIN EFFECTS
  // ============================================================
  function highlightWinningPaylines(wins) {
    // Remove all highlights first
    reelContainers.forEach(c => {
      c.querySelectorAll('.reel-cell').forEach(cell => cell.classList.remove('win-cell'));
    });

    wins.forEach(win => {
      const payline = RULES.paylines[win.paylineIndex];
      payline.forEach(([reelIdx, rowIdx]) => {
        const cell = reelContainers[reelIdx].querySelectorAll('.reel-cell')[rowIdx];
        cell.classList.add('win-cell');
      });
    });

    // Remove after animation
    setTimeout(() => {
      reelContainers.forEach(c => {
        c.querySelectorAll('.reel-cell').forEach(cell => cell.classList.remove('win-cell'));
      });
    }, 1500);
  }

  function spawnSparks(count, colorSet) {
    sparkContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = 'spark';
      spark.style.left = `${10 + Math.random() * 80}%`;
      spark.style.top = `${20 + Math.random() * 60}%`;
      spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
      spark.style.setProperty('--dy', `${-50 - Math.random() * 200}px`);
      spark.style.setProperty('--sc', colorSet[i % colorSet.length]);
      spark.style.animationDelay = `${Math.random() * 200}ms`;
      spark.style.animationDuration = `${500 + Math.random() * 500}ms`;
      sparkContainer.appendChild(spark);
    }
    setTimeout(() => { sparkContainer.innerHTML = ''; }, 1200);
  }

  function showWinBanner(text, level) {
    winBannerText.textContent = text;
    winBanner.className = 'win-banner';
    winBanner.classList.add('show', 'level-' + level);
    winBanner.removeAttribute('aria-hidden');
    setTimeout(() => {
      winBanner.classList.remove('show', 'level-' + level);
      winBanner.setAttribute('aria-hidden', 'true');
    }, level === 'jackpot' ? 3000 : 1800);
  }

  function triggerWinEffect(result) {
    if (result.winLevel === 'jackpot') {
      document.body.classList.add('jackpot-mode');
      showWinBanner('JACKPOT!! 777', 'jackpot');
      spawnSparks(60, ['#ffd700', '#ff4500', '#ff69b4', '#00bfff', '#adff2f']);
      audio.playJackpot();
      setTimeout(() => document.body.classList.remove('jackpot-mode'), 4000);
    } else if (result.winLevel === 'bigwin') {
      document.body.classList.add('bigwin-mode');
      showWinBanner('BIG WIN!!', 'bigwin');
      spawnSparks(40, ['#ffd700', '#ff6347', '#fff']);
      audio.playBigWin();
      setTimeout(() => document.body.classList.remove('bigwin-mode'), 2500);
    } else if (result.winLevel === 'win') {
      showWinBanner('WIN!', 'win');
      spawnSparks(20, ['#ffd700', '#fff']);
      audio.playWin();
    } else if (result.winLevel === 'small') {
      audio.playSmallWin();
    } else {
      audio.playLose();
    }

    if (result.freeSpinTriggered) {
      setTimeout(() => {
        showWinBanner('FREE SPIN!! 15回', 'freespin');
        spawnSparks(50, ['#00bfff', '#7fff00', '#ffd700', '#ff69b4']);
        audio.playFreeSpinTrigger();
      }, result.winLevel === 'jackpot' ? 1500 : 500);
    }

    if (result.win > 0) {
      highlightWinningPaylines(result.wins);
    }
  }

  // ============================================================
  // SPIN HANDLER
  // ============================================================
  async function onSpin() {
    if (spinning) return;
    ensureAudio();

    // Free spin visual hint
    if (engine.isFreeSpinMode) {
      audio.playFreeSpin();
    } else {
      audio.playSpinStart();
    }

    const result = engine.spin();
    if (!result.success) {
      setMessage(result.error, 'error');
      updateDisplays();
      return;
    }

    spinning = true;
    spinBtn.disabled = true;
    setMessage('スピン中...', 'spinning');

    // Animate reels
    await animateAllReels(result.reelWindows);

    spinning = false;

    // Update displays
    updateDisplays();

    // Determine message and trigger effects
    if (result.win > 0) {
      const streakText = result.winStreak >= 2 ? ` [${result.winStreak}連勝 ×${result.multiplier.toFixed(1)}]` : '';
      const winNames = result.wins.map(w => SYMBOL_NAME[w.key] || w.key).join(', ');
      setMessage(`${winNames} +${result.win}枚${streakText}`, 'win');
      triggerWinEffect(result);

      // Play streak-up sound only when the multiplier actually increases (at threshold boundaries)
      const thresholdStreaks = RULES.streakThresholds.map(t => t.min);
      if (thresholdStreaks.includes(result.winStreak)) {
        audio.playStreakUp();
      }
    } else {
      if (result.isFree) {
        setMessage(`フリースピン残り ${result.freeSpinsLeft}回`, 'freespin');
      } else {
        setMessage('はずれ... もう1回！', 'lose');
      }
      triggerWinEffect(result); // plays lose sound
    }

    // Credit warn
    if (engine.credit <= 5 && !engine.isFreeSpinMode) {
      setMessage('クレジット不足！ リセットしてください。', 'error');
    }
  }

  // ============================================================
  // BUTTON HANDLERS
  // ============================================================
  spinBtn.addEventListener('click', () => {
    ensureAudio();
    audio.playButtonClick();
    onSpin();
  });

  bet1Btn.addEventListener('click', () => {
    ensureAudio();
    if (spinning) return;
    engine.setBet(1);
    audio.playCoinInsert();
    setMessage('1BET: 1ライン');
    updateDisplays();
  });

  betMaxBtn.addEventListener('click', () => {
    ensureAudio();
    if (spinning) return;
    engine.setMaxBet();
    audio.playCoinInsert();
    setMessage('MAX BET: 5ライン');
    updateDisplays();
  });

  muteBtn.addEventListener('click', () => {
    ensureAudio();
    const nowEnabled = audio.toggleMute();
    muteBtn.textContent = nowEnabled ? '🔊' : '🔇';
    muteBtn.title = nowEnabled ? 'ミュート' : 'サウンドON';
    muteBtn.setAttribute('aria-label', nowEnabled ? 'ミュート' : 'サウンドON');
    muteBtn.setAttribute('aria-pressed', String(!nowEnabled));
  });

  resetBtn.addEventListener('click', () => {
    ensureAudio();
    if (spinning) return;
    engine.reset();
    renderInitialReels();
    setMessage('リセット完了。SPIN を押してスタート！');
    updateDisplays();
  });

  // Keyboard support
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !spinBtn.disabled) {
      e.preventDefault();
      spinBtn.click();
    }
  });

  // ============================================================
  // STARTUP
  // ============================================================
  renderInitialReels();
  updateDisplays();
  setMessage('SPIN を押してスタート！ (Space キーでも可)');

  // Mark center rows for reel animation
  reelContainers.forEach(container => {
    const cells = container.querySelectorAll('.reel-cell');
    if (cells[1]) cells[1].classList.add('center-row-marker');
  });
});
