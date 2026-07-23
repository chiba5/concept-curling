---
name: playtest
description: ビルド済みアプリを実サーバ + Playwright で 1 ゲーム完走検証する。実装完了を宣言する前に必ず実行する
---

# playtest — 完了宣言前の必須検証

1. `npm run check` — lint / typecheck / unit / build がすべて green であること
2. `npm run e2e` — Playwright がソロ導線と 2 人対戦の完走を検証する
3. どちらかが落ちたら**完了宣言をせず**、失敗内容を報告して修正する

補足:
- E2E は `SCORING_PROVIDER=demo`（API キー不要・決定的）で走る
- 初回は `npx playwright install chromium` が必要
- UI 変更時はセレクタずれで落ちやすい。**アサーションの意図（完走・SECRET 公開・判定録表示）を守ったままセレクタだけ直す**こと
