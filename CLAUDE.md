# concept-curling — CLAUDE.md

LLM が「概念どうしの無関係度」を採点する、2〜6 人用のオンライン対戦ゲーム。TypeScript monorepo（npm workspaces）でゼロから書き直した v2 実装が正。
リポジトリ: `chiba5/concept-curling`（private=false）／ デモ: https://concept-curling.onrender.com （Render Free）

---

## 1. 現状：main が正典・Render にデプロイ済み（2026-07-24 リリース）

- v2 は PR #1 で main にマージ済み（履歴保存の merge commit 方式）。`npm run check` / `npm run e2e` / CI（check + e2e）全 green
- Render（既存サービス）は main をデプロイ済み。Build `npm ci && npm run build` / Start `node packages/server/dist/index.js` / Health `/healthz` / env に `SCORING_PROVIDER=openai` + `OPENAI_API_KEY` 設定済み
- ~~既知の問題 2 件~~ **両方解決済み（2026-07-24）**: ① OpenAI 429 はクレジット追加で復旧（本番で LLM 採点・実根拠表示を確認済み） ② auto-deploy は Render GitHub App にリポジトリアクセスを付与して復旧（push → Auto-Deploy 発火を実測確認済み）
- 旧実装（単一 `server.js` の `feat/online-conversion` 版）は役目を終えている。旧ルールはコードとしてもドキュメントとしてももう存在しない。過去の記述を参照しないこと

---

## 2. 構造

```
packages/shared/     型・zod スキーマ・定数（クライアント/サーバの単一情報源。閾値の二重管理をしない）
packages/server/     Express 4 + socket.io。クライアントのビルド成果物（packages/client/dist）を静的配信
  engine/            純粋関数ステートマシン（applyEvent(state, event) → newState。I/O・socket・LLM 非依存）
  scoring/           Scorer インターフェース + OpenAI 実装 + Demo フォールバック + LRU キャッシュ
  rooms/             ルーム管理・再接続（playerToken）・CPU 代打・解決キュー
packages/client/     React 19 + Vite SPA（react-router、useReducer + Context）
```

原則：**エンジンは純粋関数**（`engine/` に副作用を持ち込まない）。**サーバが唯一の権威**で、クライアントは意図（文字列・インデックス）のみ送信し、プロンプトはサーバのみが構築する。

---

## 3. ゲームルール正

ルールの正典は `docs/superpowers/specs/2026-07-23-v2-rewrite-design.md` §3。要点のみここに書く：

- プレイヤー数・提出概念数・最大ライフ・破壊帯・テーマ数などは `GameConfig` としてルーム作成時にパラメータ化されている（2〜6 人、既定 3 人）
- スコアの向き: **0 = 極めて深い関連 / 100 = 極めて浅い（無関係）**。混同しやすいので注意
- フェーズ: `waiting → theming → submitting → picking → battle → finished`
- 既定値: 提出概念数 5 / 最大ライフ 3 / テーマ数 2 / 選抜上限（合計）150 / 破壊帯 `[10, 50)`
- SECRET（非公開ライフ）は破壊時に公開、`finished` で全 SECRET を公開
- 切断は 60 秒の猶予後に CPU が可逆的に代打する。ソロ試遊は「ソロで試す」1 クリックで CPU 2 体と即対戦

詳細な設計判断（バグの設計段階での解消、ルーム・再接続・CPU の仕様等）は同スペックの該当節を参照する。

---

## 4. 検証コマンド

```bash
npm run check   # lint(--max-warnings 0) + typecheck + test + build
npm run e2e     # Playwright（ソロ導線・複数人対戦の完走を実ブラウザで検証）
```

**実装完了を宣言する前に `/playtest` スキルを必ず実行すること。** `npm run check` と `npm run e2e` のグリーンだけでは不十分で、実際にブラウザ操作で通しプレイを確認する運用にしている。

---

## 5. 開発ノート（維持すること）

- **express は 4 系固定**（`app.get('*')` と `@types/express` が express 5 で壊れる）。安易な npm update 禁止
- root `package.json` の `overrides.vite: ^6` は vitest 3 が vite 7 を取り得るための固定。vitest 4 移行時に外す
- スコアの向きは **0 = 深い関連 / 100 = 浅い（無関係）**。実装・UI 文言両方でこの向きを守る
- `.env` は Read も Edit もしない（グローバル CLAUDE.md の方針）

---

## 6. 約束事

- 実装記録・決定ログはこのファイルに書かない。`docs/implementation-log.md` に追記する
- 大きな変更（ルーム設計、状態の持ち方、LLM プロバイダ選択など）の前にキー判断を先に提示して承認を取る
- main へのマージ・Render のデプロイ対象切替は、ユーザーの明示確認なしに実施しない
