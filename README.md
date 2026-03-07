# Slot Game

ブラウザで動く 3 リールスロットゲームです．  
ネオン路地をテーマにした，招き猫ディーラー「ミケ」付きUIです．

## 公開サイト

https://takumayellow.github.io/slot-game/

## フォルダ構成

- `docs/` 設計メモ
- `src/` 実行ファイル
- `src/scripts/` ゲームロジックと UI 制御
- `src/styles/` スタイル
- `src/assets/` 画像などの拡張用

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
- フロントエンドは既定で `https://slot-voicevox-proxy.onrender.com/voicevox` へ接続します．
- 別のプロキシを使う場合は `?voiceApi=https://<your-proxy>/voicevox` で上書きできます．
- `render.yaml` に Render.com 用の構成を同梱しています．

## デプロイ構成（Render.com）

`render.yaml` には 2 つのサービスが定義されています:

| サービス名 | 種別 | 用途 |
|---|---|---|
| `voicevox-engine` | Private Service (Docker Image) | VOICEVOX Engine 本体 |
| `slot-voicevox-proxy` | Web Service (Docker) | CORS 対応の中継プロキシ |

Render.com で `render.yaml` を使い Blueprint としてデプロイすると，`voicevox-engine` が内部ネットワークで起動し，プロキシが `http://voicevox-engine:50021` 経由で接続します．

> **注意**: `voicevox-engine` サービスは CPU 版 Docker イメージを使用するため，`starter` プラン（512MB 以上の RAM）が必要です．

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
