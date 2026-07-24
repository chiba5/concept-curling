# 実装ログ — concept-curling v2

## 2026-07-23 P1: monorepo 足場

- `feat/v2-rewrite` で旧実装を撤去し、npm workspaces monorepo（shared / server / client）を構築
- shared: ゲーム型 + zod スキーマ（SECRET インデックス検証を型とスキーマに焼き付け）
- 決定: shared は TS ソース直 export（server は tsup で noExternal バンドル）/ root overrides で vite ^6 固定 / lint は --max-warnings 0

## 2026-07-23 P2: ゲームエンジン

- `packages/server/src/engine/` に純粋関数ステートマシンを実装（I/O 非依存、structuredClone による不変性契約）
- 検証 5 点（個数・重複・範囲・maxLives・pickable）はエンジンが担当。即敗北は applyScores 時に自動処理
- 攻撃×ライフの正準順序を `attackPairs` に固定（自席への攻撃も対象 = 現行ルール踏襲）
- lifeCount は保存せず都度計算。details の SECRET ラベルは行処理前の公開状態で決定

## 2026-07-23 P3: サーバ実行系

- Scorer 層: OpenAI（fetch 直叩き・JSON mode・timeout 15s・retry 1）+ Demo フォールバック + LRU 5,000。ResilientScorer はどのメソッドも reject しない
- Room: 直列キューで全 state 変更を序列化（旧 v1 の二重解決を運用面でも封殺）。採点はキュー外・適用はキュー内
- 再接続: playerToken 認証。waiting 退室は席詰め + token 振り直し / ゲーム中は猶予後 CPU 代打（可逆）
- private 配送は seat でなく playerToken ルーティング（席番号振り直しに安全）
- 決定的テスト手法: DemoScorer（[15..75] リマップ後）+ destroyBand [10,50) → 「攻撃 == ライフ概念（15）で必中、無関係語（75）で必外し」
- 既知の割り切り: ホスト（席1）永久離脱時は reset 不能（30 分 GC で回収）/ CPU 代打の TOCTOU（復帰直後に CPU の提出が通る窓）は許容

## 2026-07-23 P4: クライアント UI + E2E + リリース準備

- ワイヤ拡張: finished 時の全 SECRET 公開 / graceDeadline 配信 / Ack に code / room:leave 追加・errorMsg 削除
- クライアント: typed socket → api（ack 10 秒タイムアウト）→ GameProvider の 3 層。config は PublicState から読み二重定義なし
- デザイン: 活版スタイルを styles.css 1 枚に集約（流体タイポ clamp / 朱の打ち消し線 = 唯一のアニメーション）
- E2E: Playwright（demo 採点・決定的）。/playtest スキルを完了宣言前の必須検証に昇格
- 残課題: main マージ（ユーザー確認後）/ Render デプロイ対象切替 / デモ URL の動作確認
