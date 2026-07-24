/**
 * スコアの向き: 0 = 無関係 / 100 = 完全一致（一言一句同じ）。
 * 破壊判定: score > destroyThreshold のライフが破壊される。
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
  pickMinTotal: number; // 全テーマとの関連度合計の下限
  destroyThreshold: number; // 0..99、これを超えたら破壊
  /** true なら選んだライフ全部が SECRET（公開ライフなし）。false は従来（公開 + SECRET 1 つ） */
  allSecret: boolean;
  themes: ThemeConfig;
  graceSeconds: number; // 切断から CPU 代打までの猶予
}

/** submitting フェーズで採点された自分の候補（PrivateView 用） */
export interface ScoredCandidate {
  concept: string;
  /** themes と同順。scores[i] は themes[i] との関連度 */
  scores: number[];
  /** scores と同順の採点根拠（20 字程度） */
  reasons: string[];
  total: number; // scores の合計
  pickable: boolean; // total >= config.pickMinTotal
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
  livesPublic: string[]; // 公開ライフ（allSecret では常に []）
  revealedSecrets: string[]; // 破壊等で公開された SECRET の概念
  secretCount: number; // 未破壊 SECRET 数
  /** 切断中の human 席のみ非 null。この epoch ms を過ぎると CPU 代打（UI はカウントダウン表示に使う） */
  graceDeadline: number | null;
}

export interface TurnDetail {
  atkSeat: number;
  atkConcept: string;
  targetSeat: number;
  targetKind: 'normal' | 'secret';
  /** その所有者のライフ列内での安定序数。クライアントのマトリクス列対応に使う */
  targetOrdinal: number;
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
  myLives: { open: string[]; secrets: { concept: string; destroyed: boolean }[] };
  attackSubmitted: boolean;
}

/** socket.io の ack 応答（全 client→server イベント共通）。データ無し成功は { ok: true } で返せる */
export type Ack<T = undefined> =
  { ok: true; data?: T } | { ok: false; code?: string; message: string };

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
  /** selectedIndices の部分集合。allSecret ルームでは selectedIndices と同値、従来モードはちょうど 1 個 */
  secretIndexes: number[];
}
export interface AttackPayload {
  concept: string;
}

export interface ClientToServerEvents {
  'room:create': (p: CreateRoomPayload, cb: (res: Ack<RoomJoined>) => void) => void;
  'room:join': (p: JoinRoomPayload, cb: (res: Ack<RoomJoined>) => void) => void;
  'room:addCpu': (cb: (res: Ack) => void) => void;
  'room:reset': (cb: (res: Ack) => void) => void;
  'room:leave': (cb: (res: Ack) => void) => void;
  'room:start': (cb: (res: Ack) => void) => void;
  'game:submitConcepts': (p: SubmitConceptsPayload, cb: (res: Ack) => void) => void;
  'game:pickLives': (p: PickLivesPayload, cb: (res: Ack) => void) => void;
  'game:attack': (p: AttackPayload, cb: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (s: PublicState) => void;
  private: (v: PrivateView) => void;
}
