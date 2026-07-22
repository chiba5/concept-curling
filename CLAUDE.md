# concept-curling — CLAUDE.md

LLM が「概念間の無関係度」を採点する、3人用オンライン対戦ゲーム。
リポジトリ: `chiba5/concept-curling`（private=false）／ デモ: https://concept-curling.onrender.com （Render Free）

---

## 1. 最重要：正典ブランチは `feat/online-conversion`

**`main` は 2025-09 時点の古いソロ版で、デプロイもされていない。**
`main` の README が説明している「最も孤立した概念を出した人が勝ち」というルールは**現行ゲームではない**。

- 実体・デプロイ対象・作業対象 = `feat/online-conversion`
- 差分は 8ファイル / +2686 行。socket.io 導入でオンライン同時対戦化されている
- **README の内容と実装が一致していない**。README を根拠に実装判断をしないこと
- ブランチ統合（実体を main にする）は未実施の課題

---

## 2. 現行ゲームルール（実装準拠、server.js が正）

3人固定。フェーズは `Phase` 定数（server.js:25-34）で管理。

1. `waiting` — 3席が埋まるまで待機
2. `theme` — LLM が日本語テーマを2つ生成（失敗時は固定プールにフォールバック）
3. `private5_input` — 各自が概念を**5つ非公開で提出**。各概念×2テーマの無関係度を LLM が 0〜100 で採点し、`normalizeScoresForPick` が [15..85] に線形リマップ
4. `life_pick` — 5つの中から **2テーマのスコア合計が 150 (`PICK_SUM_LIMIT`) 以下**のものを 1〜3 個選んでライフにする。うち1つを **SECRET**（他プレイヤーに非公開）に指定。条件を満たすものが0個なら即敗北
5. `battle` — 全員が同時に攻撃概念を1つ提出 → 全「攻撃 × 全プレイヤーの全ライフ」を LLM が採点し、**スコアが `10 <= score < 50` ならそのライフを破壊**。SECRET は破壊と同時に公開
6. ライフが0になったら脱落。生存1人以下で `finished`

スコアの向き: **0 = 極めて深い関連 / 100 = 極めて浅い（無関係）**。混同しやすいので注意。

---

## 3. 構造

```
server.js              626行。Express + socket.io + ゲーム状態 + LLM採点をすべて含む単一ファイル
public/index.html      画面（フェーズごとの表示切替）
public/script.js       socket イベント送受信 + render()/renderPrivate()
public/style.css
concept-online-min/    package.json と lock だけのゴミディレクトリ（削除候補）
```

**サーバ状態はグローバル変数 `let game` 1個のみ**（server.js:37）。ルームの概念がない。

### LLM 採点（server.js:508 `scorePairsLLM`）
- OpenAI Chat Completions を **fetch で直叩き**（`openai` パッケージは依存から外れている）
- モデルは `OPENAI_MODEL`（既定 `gpt-4o-mini`）、temperature は `OPENAI_TEMPERATURE`（既定 0.2）
- **プロンプトはすべてサーバ側で構築**。クライアントからは概念文字列しか渡らない（＝プロンプトインジェクション経路は塞がっている。この設計を壊さないこと）
- `game.relCache`（"a|b" → score）でキャッシュし、未計算ペアだけをバッチで問い合わせる
- **API キーが無い / 呼び出しが失敗した場合は `demoScore`（bigram Jaccard）に全フォールバック**。つまり `OPENAI_API_KEY` 無しでも一応最後まで遊べる。この二重化は維持する

---

## 4. 既知の地雷（触る前に読む）

1. **ルームがない** — 同時に4人目が来ると「満席」、逆に誰か1人が繋ぎっぱなしだと他の人は永久に遊べない。公開デモとして成立していない
2. **誰か1人が disconnect すると `game = resetGame()` で全員のゲームが消える**（server.js:382-389）。リロードでも発動。再入場・再接続の手段がない
3. `resolveTurn()` が async。`submitAttack` 側は await せずに `broadcast()` へ抜けるため、同時提出時に二重解決しうる
4. **デッドコード**: `scorePairsEmb` / `embeddingsFor` / `cosine`（embedding 採点の実験跡・未使用）、`Phase.P5_SCORED`、`relScore`（`demoScore` の薄いラッパー）
5. `io` の CORS が `origin: "*"`
6. 破壊判定の `10 <= score < 50` はマジックナンバー。「同義すぎる（<10）と破壊されない」がゲームとして正しいかは未検証
7. Render Free はコールドスタート実測 **22秒**。人に見せる場面では事前にウォームアップが要る

---

## 5. 開発・検証

```bash
npm install
# .env に OPENAI_API_KEY=... を置く（無くてもフォールバックで起動はする）
npm start          # http://localhost:3000
```

- Node v22 で動作確認済み（`engines` 指定は現ブランチの package.json にはない）
- **テストも CI も存在しない**。したがって「実装完了」を宣言する前の検証は、
  **サーバを起動し、ブラウザのタブを3つ開いて実際に1ゲーム最後まで通す**こと。
  ここを省略して完了報告しない
- テスト基盤の導入自体が未着手の課題（フェーズ遷移とスコア判定はユニットテストしやすい）

---

## 6. このプロジェクトの目的（2026-07-22 時点）

1. **就活ポートフォリオとして見せられる水準にする** — 現在 job-hunting が最優先タスク。面接で見せる可能性がある
2. **ゲームとして面白くする** — ルールの納得感、採点根拠の可視化

**「3人集めないと遊べない」ことがポートフォリオとしての最大の障害**。面接官が一人で触れる導線（CPU 相手のソロ試遊、またはリプレイ再生）が要る。

推奨する着手順: ルーム制の導入 → ソロ試遊導線 → README をデプロイ版に合わせて書き直し → ブランチ統合。

---

## 7. 約束事

- `.env` は Read も Edit もしない（グローバル CLAUDE.md の方針）
- 実装記録・決定ログはこのファイルに書かない。`docs/implementation-log.md` を作ってそちらへ
- 大きな変更の前にキー判断（ルーム設計、状態の持ち方、LLM プロバイダ選択）を先に提示して承認を取る
