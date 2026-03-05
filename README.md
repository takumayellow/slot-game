# Slot Game

ブラウザで動く 3 リールスロットゲームです．

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

## 実装方針

- ロジックを `SlotEngine` クラスに分離
- シンボル設定と配当設定を `config.js` へ分離
- UI からはロジックの公開 API のみを呼ぶ

## 今後の拡張候補

- ボーナスゲーム
- 効果音
- セーブデータ（LocalStorage）
- リールごとの停止演出
