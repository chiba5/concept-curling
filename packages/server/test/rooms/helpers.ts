import type { GameConfig, PrivateView, PublicState } from '@concept-curling/shared';

/**
 * 決定的テスト用 config（従来モード = allSecret false。1-secret 前提のテスト群をそのまま活かす）。
 * DemoScorer は [25..85] にリマップ済み: 完全一致 → 85（destroyThreshold 50 以上 → 破壊）、
 * 無関係語 → 25（50 未満 → 安全）。無関係語のテーマスコア合計は 25×2=50 >= pickMinTotal 50 で全候補 pickable。
 * （このテスト群は既定値でなく明示 50/50 の config を固定している）
 */
export const DET_CONFIG: GameConfig = {
  playerCount: 2,
  conceptsPerPlayer: 3,
  maxLives: 1,
  pickMinTotal: 50,
  destroyThreshold: 50,
  allSecret: false,
  themes: { count: 2, mode: 'manual', manual: ['星座', '航海'] },
  graceSeconds: 10,
};

/** 全ライフ SECRET モードの決定的テスト用 config（複数 SECRET を試すため maxLives=2） */
export const DET_ALLSECRET_CONFIG: GameConfig = {
  ...DET_CONFIG,
  allSecret: true,
  maxLives: 2,
};

export interface Collected {
  pub: PublicState[];
  priv: Map<number, PrivateView>;
  cb: {
    onPublic: (s: PublicState) => void;
    onPrivate: (seat: number, v: PrivateView) => void;
  };
  last: () => PublicState | undefined;
}

export function collect(): Collected {
  const pub: PublicState[] = [];
  const priv = new Map<number, PrivateView>();
  return {
    pub,
    priv,
    cb: {
      onPublic: (s) => pub.push(s),
      onPrivate: (seat, v) => priv.set(seat, v),
    },
    last: () => pub[pub.length - 1],
  };
}

/** 条件成立までポーリング（実タイマー用。fake timer テストでは使わない） */
export async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('until: timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

export const NO_DELAY = { cpuDelayMs: { min: 0, max: 0 } };
