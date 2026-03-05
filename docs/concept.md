# スロットゲーム構想

## コンセプト

- 短時間で遊べる，学習向けの軽量スロット
- 仕様を追いやすいように，ロジックと UI を分離
- 後から機能追加しやすいディレクトリ構成

## ゲーム仕様

- リール数：3
- 勝敗ライン：中央 1 ライン
- 初期クレジット：100
- ベット：1〜5
- 配当：ベット倍率で計算

### シンボルと基本配当

- 7: 50
- BAR: 25
- Bell: 15
- Cherry: 8
- Lemon: 5
- Grape: 3

### 役判定

- 3 つ同じ：シンボル配当 × ベット
- Cherry が 2 つ：2 × ベット
- それ以外：0

## 技術選定

- HTML/CSS/JavaScript（ビルド不要）
- ES Modules で責務分割

## ディレクトリ戦略

- `src/index.html`：エントリポイント
- `src/styles/main.css`：画面スタイル
- `src/scripts/config.js`：シンボル定義と配当
- `src/scripts/engine.js`：状態管理と当たり判定
- `src/scripts/ui.js`：DOM 操作とアニメーション
