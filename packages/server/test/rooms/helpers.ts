import type { GameConfig, PrivateView, PublicState } from '@concept-curling/shared';

/**
 * 決定的テスト用 config。
 * DemoScorer では無関係語のテーマスコアが 100 → 合計 200 <= 200 で全候補 pickable。
 * destroyBand [0,100): 攻撃 == ライフ概念 → score 0 → 破壊 / 無関係語 → 100 → 帯外で安全。
 */
export const DET_CONFIG: GameConfig = {
  playerCount: 2,
  conceptsPerPlayer: 3,
  maxLives: 1,
  pickSumLimit: 200,
  destroyBand: { min: 0, max: 100 },
  themes: { count: 2, mode: 'manual', manual: ['星座', '航海'] },
  graceSeconds: 10,
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
