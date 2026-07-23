# concept-curling v2 全面作り直し — 設計書

- 日付: 2026-07-23
- ステータス: ユーザー承認済み（ブレインストーミング完了）
- 対象ブランチ: `feat/v2-rewrite`（`feat/online-conversion` から分岐）

## 1. 目的と背景

- 現行実装（`feat/online-conversion`）はルーム無し・切断でゲーム全消し・SECRET 指定バグ・4人目入室でサーバクラッシュ・XSS 等の構造問題を抱える。修正ではなく**ルールを維持したまま 0 から作り直す**
- 第一目的は**就活ポートフォリオ**：面接官が一人で 1 クリックで試遊でき、モダン定番スタック（TypeScript + React）で説明できる状態にする
- 第二目的はゲームとしての納得感向上：**採点根拠の一行可視化**を v1 に含める
- 実装は安価なモデル（Sonnet 等）に降ろす前提で、本設計書と実装計画を詳細に作る

## 2. スコープ

### v1 に含む

- 現行 3 人対戦ルールの移植 + **全パラメータのルーム設定化**（人数 2〜6 / 提出概念数 / ライフ数 / スコア閾値 / テーマ指定・個数）
- ルーム制（同時複数ゲーム）、URL コード参加
- CPU プレイヤー（ソロ試遊 = 人間 1 + CPU n）
- 再接続（リロード・画面ロックで席を失わない）、離脱時は猶予後 CPU 代打（可逆）
- マルチプロバイダ LLM 採点（OpenAI / Anthropic / Demo フォールバック）
- 採点根拠の一行表示
- モバイル対応（モバイルファースト）
- ユニットテスト + Playwright E2E + GitHub Actions CI

### v1 に含まない（見送り）

- 縦組みテーマ表示・ダークモード（UI 技術候補から不採用）
- DB 永続化（サーバ再起動でルーム消滅は許容）
- 観戦者・リプレイ・ランキング
- プロバイダのルーム内 UI 切替（環境変数でのみ切替）
- スコアの [15..85] 正規化（**廃止**。§5.3 参照）

## 3. ゲームルール（v1 正）

現行ルールを踏襲しつつパラメータ化する。スコアの向きは **0 = 極めて深い関連 / 100 = 極めて浅い（無関係）**。

1. `waiting` — ルームの席（`playerCount`）が埋まるまで待機。CPU で埋めても良い
2. `theming` — テーマを `themes.count` 個用意（LLM 生成 or ホスト手入力。生成失敗時は固定プール）
3. `submitting` — 各自 `conceptsPerPlayer` 個の概念を非公開提出。各概念 × 各テーマの無関係度を LLM が 0〜100 で採点（根拠一行つき）
4. `picking` — 全テーマスコア合計が `pickSumLimit` 以下の候補から 1〜`maxLives` 個選びライフにする。うち 1 つを SECRET に指定。条件を満たす候補が 0 なら即敗北
5. `battle` — 生存者全員が攻撃概念を同時提出 → 全「攻撃 × 全生存者の全ライフ」を採点し、`destroyBand.min <= score < destroyBand.max` のライフを破壊。SECRET は破壊時に公開。ライフ 0 で脱落
6. `finished` — 生存 1 人以下で終了。全 SECRET 公開と判定録の振り返りを表示

## 4. アーキテクチャ

npm workspaces monorepo・全面 TypeScript（ESM）・Node 22。

```
packages/shared/     型・zod スキーマ・定数（閾値の二重管理を根絶）
packages/server/     Express + socket.io。クライアントのビルド成果物を静的配信
  engine/            純粋関数ステートマシン（I/O・socket・LLM 非依存）
  rooms/             ルーム管理・再接続・CPU 制御・解決キュー
  scoring/           Scorer インターフェース + プロバイダ実装 + LRU キャッシュ
packages/client/     Vite + React SPA（react-router、useReducer + Context）
```

原則:

1. **サーバが唯一の権威**。クライアントは意図（文字列・インデックス）のみ送信。プロンプトはサーバのみが構築（現行の設計原則を維持）
2. **境界は型 + zod**。socket イベント名とペイロードは shared で一元定義し、client→server は全メッセージを zod で実行時検証
3. **エンジンは純粋**。`applyEvent(state, event) → newState`。非同期（LLM 採点）はルームコントローラが外で実行し、結果をイベントとして注入

## 5. ゲームエンジン

### 5.1 GameConfig（ルーム作成時に確定、以後不変）

```ts
type GameConfig = {
  playerCount: number;        // 2..6, 既定 3
  conceptsPerPlayer: number;  // 3..9, 既定 5
  maxLives: number;           // 1..conceptsPerPlayer-1, 既定 3
  pickSumLimit: number;       // 既定 150（テーマ数×100 を上限に UI で制約）
  destroyBand: { min: number; max: number }; // 既定 { min: 10, max: 50 }
  themes: { count: number; mode: 'llm' | 'manual'; manual?: string[] }; // count 既定 2
  graceSeconds: number;       // 切断猶予, 既定 60
};
```

- `pickSumLimit` の意味は「全テーマとのスコア合計」。テーマ数が 2 以外のときも同じ定義（UI の既定値はテーマ数 × 75 を提示する）

### 5.2 フェーズと状態

- フェーズ: `waiting | theming | submitting | picking | battle | finished` の 6 つ。現行の死にフェーズ（`P5_SCORED`, `LIFE_REVEAL`）は置かない
- 状態はルームごとに 1 オブジェクト。公開情報（`PublicState`）と席ごとの非公開情報（`PrivateView`）を分離して配信

### 5.3 現行バグの設計段階での解消

| 現行の問題 | v2 での解消 |
|---|---|
| SECRET 指定のインデックス不整合（進行不能/誤選択） | `{ selectedIndices: number[], secretIndex: number }`、`secretIndex ∈ selectedIndices` を zod + エンジン両方で検証。インデックス空間は「候補リスト内」で統一 |
| 満席時 join でサーバクラッシュ | ルーム制で構造ごと消滅。全ハンドラは zod 検証 + try/catch で例外を socket エラー応答に変換 |
| resolveTurn 二重解決 | ルームごとの逐次実行キュー。解決中の追加提出は拒否 |
| 切断 = 全員のゲーム消滅 | playerToken による再接続（§6） |
| XSS | React のエスケープに全面依存。innerHTML 直挿しは行わない |
| スコア正規化の経路不整合 | **正規化を廃止し生スコアを使用**。理由: [15..85] リマップは「合計 ≤ 上限」判定の意味を提出セット依存にし、閾値のルーム設定化と論理的に衝突する。散らばりが不足する場合は採点プロンプトの目安帯で調整 |
| resetGame を誰でも発火可能 | ルーム内投票または作成者のみに限定（v1 は作成者のみ） |
| CORS `origin: "*"` | 同一オリジン配信のため CORS 自体を撤去（開発時のみ Vite プロキシ） |

## 6. ルーム・再接続・CPU

### 6.1 ルーム

- `Map<roomId, Room>`（インメモリ、DB なし）。roomId は 6 文字英数コード。参加は `/room/:id` URL またはコード入力
- ルーム作成時にホストが `GameConfig` を設定。最終切断から 30 分で GC
- ロビーに **「ソロで試す」ボタン**：1 クリックで既定設定（3 人・CPU2）のルームを作成し即開始（面接官導線）

### 6.2 身元と再接続

- 初回参加時にサーバが `playerToken`（UUID）を発行、クライアントは localStorage に保存
- socket 接続は常に `(roomId, playerToken)` で席を認証。リロード・画面ロック・回線切替は「同じ席への再接続」となり、再接続時は `PublicState` + 自席の `PrivateView` を全量再送
- 切断席は `graceSeconds` 経過で `controller: 'human' → 'cpu'` に切替。**人間が戻れば即 human に戻る**（可逆）

### 6.3 CPU プレイヤー

| 判断 | 方式 |
|---|---|
| 概念提出 | LLM にテーマを渡し「中距離の概念 N 個」を生成。キー無し時は内蔵語彙プールからランダム |
| ライフ選抜 | 決定的ロジック（条件充足候補から合計の低い順に `maxLives` 個、SECRET はその中からランダム） |
| 攻撃 | LLM に相手の公開ライフ一覧を渡し「破壊帯に入りそうな概念」を 1 つ生成。キー無し時は語彙プール |

- CPU の行動には 1〜3 秒の擬似遅延を入れる
- 難易度調整は v1 スコープ外（単一難易度）

## 7. LLM 採点層

```ts
interface Scorer {
  scorePairs(pairs: { a: string; b: string }[]): Promise<{ score: number; reason: string }[]>;
  generateThemes(count: number): Promise<string[]>;
  generateConcepts(themes: string[], n: number): Promise<string[]>; // CPU 用
}
```

- 実装: `OpenAIScorer`（既定 `gpt-4o-mini`）/ `AnthropicScorer`（既定 `claude-haiku-4-5`）/ `DemoScorer`（bigram Jaccard、reason は「簡易採点」固定）
- 選択: `SCORING_PROVIDER=openai|anthropic|demo`。モデル・temperature も env で上書き可。**選択プロバイダ失敗時は DemoScorer へ全フォールバック**（キー無しでも完走できる現行特性を維持）
- 採点根拠: 同一 JSON 応答で `{ i, score, reason }`（reason は 20 字程度の日本語）。選抜時の自スコア表示とバトル判定録の両方に出す
- キャッシュ: キー `provider|model|normalize(a)|normalize(b)`、LRU 上限 5,000 件（reason 込み）、全ルーム共有
- 堅牢化: タイムアウト 15 秒 + リトライ 1 回、スコアは 0..100 にクランプ、欠損は demo 値で穴埋め、JSON mode 使用

## 8. UI

### 8.1 画面

1. **ロビー** `/` — タイトル・30 秒で読めるルール・「ソロで試す」「ルームを作る」「コードで参加」
2. **待機室** `/room/:id`（waiting フェーズ） — 参加 URL コピー・席状況・設定サマリ・CPU 追加
3. **ゲーム画面**（同ルート、フェーズで切替） — ヘッダ（ラウンド・テーマ）+ プレイヤー帯 + フェーズ別メインパネル + 判定録
4. **決着画面** — 勝者・全 SECRET 公開・全ラウンド判定録

### 8.2 ビジュアル（承認済みモックアップ v2 準拠）

- 「活版・組版」言語: 紙色地 `#f7f4ee`・墨 `#1b1b1b`・朱 `#c73e3a` の 3 色、明朝系フォント、罫線と余白のエディトリアルグリッド
- 禁止: 角丸カード・グラデーション・ドロップシャドウ・emoji（AI っぽさの排除）
- 採用技術（v1 は最小実装）:
  - **流体タイポグラフィ**: `clamp()` による連続伸縮、モバイル 1 カラム ⇔ PC 非対称グリッドを CSS Grid で切替
  - **タイポのみの破壊演出**: 朱の打ち消し線が引かれ文字が沈む。CSS transition のみ、JS アニメライブラリ不使用
- 採点根拠は判定録に「概念 → 概念　スコア／理由一行」の組版で表示

## 9. テスト・CI・開発体験

- **Vitest**: エンジン純粋関数の網羅（フェーズ遷移・SECRET 検証・破壊帯・脱落・可変 config の境界値）、採点層のフォールバック連鎖（fetch モック）
- **Playwright E2E**: DemoScorer（決定的・キー無し）で 3 ブラウザコンテキストが 1 ゲーム完走。`/playtest` スキルとしてプロジェクトに常設し、完了宣言前の必須検証にする
- **GitHub Actions**: push ごとに lint / typecheck / test / build / E2E（headless）
- **hooks**: `.env` の Read/Edit ブロック（PreToolUse）、編集後 Prettier 自動整形（PostToolUse）
- 検証コマンドはプロジェクト CLAUDE.md に明記して更新する

## 10. デプロイ・移行

- ホスティング: **Render Free 継続**。サーバがクライアントビルドを静的配信する単一サービス。コールドスタート 22 秒は「見せる前のウォームアップ手順」+ ローディング画面の丁寧な設計で吸収
- ブランチ: `feat/v2-rewrite` で作業 → 完成・検証後 **main にマージして main を正典に戻す** → README 全面書き直し → Render のデプロイ対象を main へ → `concept-online-min/` 削除
- 実装記録は `docs/implementation-log.md` に残す（プロジェクト CLAUDE.md の約束事）

## 11. 実装順序の大枠（実装計画は別途 writing-plans で詳細化）

1. monorepo 足場 + shared 型/スキーマ + CI
2. エンジン（純粋関数）+ ユニットテスト
3. 採点層（Demo → OpenAI → Anthropic）+ テスト
4. ルーム・socket 配線・再接続
5. CPU プレイヤー
6. クライアント UI（ロビー → 待機室 → ゲーム → 決着）
7. E2E・/playtest スキル・hooks
8. README・デプロイ・ブランチ統合
