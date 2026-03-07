export const SYMBOLS = [
  { key: "SEVEN", icon: "7️⃣", name: "7", weight: 6, payout: 50 },
  { key: "BAR", icon: "🟥", name: "BAR", weight: 10, payout: 25 },
  { key: "BELL", icon: "🔔", name: "Bell", weight: 13, payout: 15 },
  { key: "CHERRY", icon: "🍒", name: "Cherry", weight: 20, payout: 8 },
  { key: "LEMON", icon: "🍋", name: "Lemon", weight: 24, payout: 5 },
  { key: "GRAPE", icon: "🍇", name: "Grape", weight: 27, payout: 3 },
];

export const RULES = {
  startingCredit: 100,
  minBet: 1,
  maxBet: 5,
  cherryPairMultiplier: 2,
};

export const VOICEVOX_CONFIG = {
  // Default proxy URL for the deployed environment (Render.com).
  // Override via ?voiceApi=<url> query parameter.
  defaultProxyUrl: "https://slot-voicevox-proxy.onrender.com/voicevox",
  targetSpeakerName: "春日部つむぎ",
};
