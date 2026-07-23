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
