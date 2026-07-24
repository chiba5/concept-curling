# 概念カーリング（Concept Curling）

LLM が「概念どうしの関連度」を採点する、2〜6 人用のオンライン対戦ゲームです。

デモ: https://concept-curling.onrender.com （Render Free — 初回アクセスは起動に 20 秒ほどかかります）

## 遊び方（3 分）

- **ソロで試す**: トップの「ソロで試す」ボタン → CPU 2 体との 3 人戦がすぐ始まります
- **友人と**: 「ルームを作る」→ 発行されたルームコードを共有（2〜6 人・人数やライフ数などのルールを調整可能）
- **ルール**（ロビーに表示される 4 項目）:
  1. 2 つのテーマが出ます。各自、テーマと「深すぎず浅すぎない」概念を 5 つ非公開で出します
  2. AI が各概念とテーマの関連度を 0〜100 で採点します（**0 = 無関係、100 = 完全一致**）。合計が下限（既定 30）以上の概念だけをライフにできます（最大 3 つ、既定では全部が相手に見えない SECRET）
  3. 全員同時に攻撃概念を 1 つ出します。攻撃と相手ライフの関連度が**閾値（既定 70）以上なら**そのライフは破壊されます（遠すぎる攻撃は届きません）
  4. ライフが尽きたら脱落。最後まで残った人の勝ちです

## 技術スタック

TypeScript monorepo (npm workspaces) / React 19 + Vite / Express 4 + socket.io / zod / Vitest + Playwright / GitHub Actions

## アーキテクチャ

- `packages/shared` — 型・zod スキーマ・定数（クライアント/サーバの単一情報源）
- `packages/server` — 純粋関数ゲームエンジン（I/O 非依存）/ LLM 採点層（OpenAI + フォールバック）/ ルーム・再接続・CPU 制御
- `packages/client` — React SPA（活版・組版スタイル）
- 設計の要点: サーバが唯一の権威 / プロンプトはサーバのみが構築 / 切断は 60 秒の猶予後に CPU が代打（復帰可能）

## 開発

```bash
npm install
npm run dev -w @concept-curling/server   # サーバ (tsx watch, :3000)
npm run dev -w @concept-curling/client   # クライアント (vite, :5173 → /api,/socket.io をプロキシ)
npm run check   # lint + typecheck + test + build
npm run e2e     # Playwright
# 初回は npx playwright install chromium が必要（ビルド済みサーバを自動起動して検証）
```

環境変数は `.env.example` を参照してください。`OPENAI_API_KEY` が無くても簡易採点（DemoScorer）で全機能が動作します。

## テスト

- ユニット・統合テスト（ゲームエンジン・LLM 採点層・ルーム管理・socket 経由の E2E）
- Playwright（ソロ導線、複数人対戦の完走までを実ブラウザで検証）
