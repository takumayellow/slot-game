# Slot Game

ブラウザで動く 3 リールスロットゲームです．  
ネオン路地をテーマにした，招き猫ディーラー「ミケ」付きUIです．

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
- GitHub Pages (HTTPS) では `http://localhost:50021` を直接呼べないため，`voiceApi` の指定が必要です．

例:

```text
https://<user>.github.io/slot-game/?voiceApi=https://<your-voicevox-proxy>
```

- 正しい春日部つむぎ音声を強制するため，デフォルトではブラウザ音声フォールバックを無効化しています．
- 検証用にフォールバックを使いたい場合のみ `fallbackSpeech=1` を追加します．

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
