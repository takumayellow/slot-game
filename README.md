# Slot Game

ブラウザで動く 3 リールスロットゲームです．  
ネオン路地をテーマにした，招き猫ディーラー「ミケ」付きUIです．

## 公開サイト

**[→ ゲームを遊ぶ (V1)](https://takumayellow.github.io/slot-game/)**
**[→ ゲームを遊ぶ (V2・本格パチスロUI刷新版)](https://takumayellow.github.io/slot-game/v2/)**

V2 は 5 ペイライン・フリースピン・連勝倍率を備えた新エンジン/UIです．V1 の画面上部にあるリンクからも行き来できます．

## フォルダ構成

- `docs/` 設計メモ
- `src/` V1 実行ファイル
- `src/scripts/` ゲームロジックと UI 制御
- `src/styles/` スタイル
- `src/assets/` 画像などの拡張用
- `src-v2/` V2（本格パチスロUI刷新版）実行ファイル一式

## 起動方法

1. `src/index.html` をブラウザで開く
2. またはローカルサーバーを使う場合

```powershell
cd src
python -m http.server 8080
```

`http://localhost:8080` にアクセスします．

## VOICEVOX連携

- 春日部つむぎ音声は VOICEVOX API で再生します．
- 既定の接続先は `/voicevox` です（同一オリジンのプロキシ想定）．
- ローカル開発では Vite などで `/voicevox -> http://127.0.0.1:50021` をプロキシしてください．
- GitHub Pages で使う場合は，`voiceApi` で HTTPS の中継APIを指定してください．
- GitHub Pages 単体では，ブラウザから `localhost:50021` へ直接接続できないため，中継なし運用はできません．

例:

```text
https://<user>.github.io/slot-game/?voiceApi=https://<your-voicevox-proxy>
```

- 正しい春日部つむぎ音声を優先するため，ブラウザ音声フォールバックは使いません．

## 付属プロキシサーバー

`proxy/` に VOICEVOX 中継サーバー（Node.js + Express）を同梱しています．

起動:

```powershell
cd proxy
npm install
$env:VOICEVOX_ENGINE_URL="http://127.0.0.1:50021"
$env:CORS_ALLOW_ORIGINS="https://takumayellow.github.io"
npm start
```

利用URL例:

```text
https://takumayellow.github.io/slot-game/?voiceApi=https://<your-proxy-domain>/voicevox
```

## 推奨画面

- スマホ横向き（ランドスケープ）で，スロット本体を大きく表示
- Pay情報はミニ表示で，ゲーム画面を主役に配置

## 実装方針

- ロジックを `SlotEngine` クラスに分離
- シンボル設定と配当設定を `config.js` へ分離
- UI からはロジックの公開 API のみを呼ぶ

## 今後の拡張候補

- ボーナスゲーム
- 効果音
- セーブデータ（LocalStorage）
- リールごとの停止演出