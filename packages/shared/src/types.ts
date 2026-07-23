/**
 * スコアの向き: 0 = 極めて深い関連 / 100 = 極めて浅い（無関係）。
 * 破壊判定: destroyBand.min <= score < destroyBand.max のライフが破壊される。
 */

export type Phase = 'waiting' | 'theming' | 'submitting' | 'picking' | 'battle' | 'finished';
export type Controller = 'human' | 'cpu';

export interface ThemeConfig {
  count: number;
  mode: 'llm' | 'manual';
  /** mode === 'manual' のとき count 個ちょうど */
  manual?: string[];
}

export interface GameConfig {
  playerCount: number; // 2..6
  conceptsPerPlayer: number; // 3..9
  maxLives: number; // 1..conceptsPerPlayer-1
  pickSumLimit: number; // 全テーマとのスコア合計の上限
  destroyBand: { min: number; max: number }; // min < max、いずれも 0..100
  themes: ThemeConfig;
  graceSeconds: number; // 切断から CPU 代打までの猶予
}

/** submitting フェーズで採点された自分の候補（PrivateView 用） */
export interface ScoredCandidate {
  concept: string;
  /** themes と同順。scores[i] は themes[i] との無関係度 */
  scores: number[];
  /** scores と同順の採点根拠（20 字程度） */
  reasons: string[];
  total: number; // scores の合計
  pickable: boolean; // total <= config.pickSumLimit
}

export interface PublicPlayer {
  seat: number; // 1..playerCount
  name: string;
  controller: Controller;
  connected: boolean;
  alive: boolean;
  /** 提出済みか等、フェーズ進行の待ち表示に使う */
  ready: boolean;
  lifeCount: number;
  livesPublic: string[]; // 公開ライフ（SECRET を除く残存分）
  secretRevealed: string | null; // 破壊等で公開された SECRET
  hasSecret: boolean; // SECRET が未破壊で存在するか
}

export interface TurnDetail {
  atkSeat: number;
  atkConcept: string;
  targetSeat: number;
  targetKind: 'normal' | 'secret';
  /** 未公開 SECRET は 'SECRET' に伏せる */
  targetLabel: string;
  score: number;
  reason: string;
  destroyed: boolean;
}

export interface TurnRecord {
  round: number;
  attacks: { seat: number; concept: string }[];
  details: TurnDetail[];
  destroys: { seat: number; kind: 'normal' | 'secret'; concept: string }[];
  reveals: { seat: number; concept: string }[];
  eliminatedSeats: number[];
}

export interface PublicState {
  roomId: string;
  phase: Phase;
  round: number; // battle 開始で 1、以降ターンごとに +1
  themes: string[]; // theming 完了までは []
  config: GameConfig;
  players: PublicPlayer[];
  turns: TurnRecord[];
  winnerSeat: number | null; // finished かつ全滅時は null
  hostSeat: number;
}

export interface PrivateView {
  seat: number;
  playerToken: string;
  /** 自分が提出した概念（未提出は null）。採点完了前の再接続復元に使う */
  myConcepts: string[] | null;
  candidates: ScoredCandidate[]; // submitting の採点完了後に入る
  myLives: { normals: string[]; secret: string | null; secretDestroyed: boolean };
  attackSubmitted: boolean;
}

export interface ErrorPayload {
  message: string;
}

/** socket.io の ack 応答（全 client→server イベント共通） */
export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

export interface RoomJoined {
  roomId: string;
  seat: number;
  playerToken: string;
}

export interface CreateRoomPayload {
  name: string;
  config: GameConfig;
}
export interface JoinRoomPayload {
  roomId: string;
  name: string;
  /** 再接続時のみ。一致する席があれば復帰 */
  playerToken?: string;
}
export interface SubmitConceptsPayload {
  concepts: string[]; // conceptsPerPlayer 個ちょうど
}
export interface PickLivesPayload {
  /** candidates のインデックス（pickable なもののみ、1..maxLives 個） */
  selectedIndices: number[];
  /** selectedIndices に含まれる candidates インデックス */
  secretIndex: number;
}
export interface AttackPayload {
  concept: string;
}

export interface ClientToServerEvents {
  'room:create': (p: CreateRoomPayload, cb: (res: Ack<RoomJoined>) => void) => void;
  'room:join': (p: JoinRoomPayload, cb: (res: Ack<RoomJoined>) => void) => void;
  'room:addCpu': (cb: (res: Ack) => void) => void;
  'room:reset': (cb: (res: Ack) => void) => void;
  'room:start': (cb: (res: Ack) => void) => void;
  'game:submitConcepts': (p: SubmitConceptsPayload, cb: (res: Ack) => void) => void;
  'game:pickLives': (p: PickLivesPayload, cb: (res: Ack) => void) => void;
  'game:attack': (p: AttackPayload, cb: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (s: PublicState) => void;
  private: (v: PrivateView) => void;
  errorMsg: (e: ErrorPayload) => void;
}
