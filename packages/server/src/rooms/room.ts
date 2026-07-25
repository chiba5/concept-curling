import { randomUUID } from 'node:crypto';
import type {
  GameConfig,
  PrivateView,
  PublicState,
  ScoredCandidate,
} from '@concept-curling/shared';
import * as engine from '../engine/index.js';
import type { Scorer } from '../scoring/scorer.js';
import { decideAttack, decidePick, type SecretClue } from './cpu.js';

export interface RoomCallbacks {
  onPublic(state: PublicState): void;
  onPrivate(seat: number, view: PrivateView): void;
}

export interface RoomOptions {
  /** CPU 行動の擬似遅延。既定 1000..3000ms、テストは 0..0 */
  cpuDelayMs?: { min: number; max: number };
  now?: () => number;
}

export interface JoinResult {
  seat: number;
  token: string;
  rejoined: boolean;
}

const CPU_NAMES = ['CPU・北', 'CPU・南', 'CPU・東', 'CPU・西', 'CPU・中'];

/**
 * 1 ルーム = エンジン state + 直列実行キュー + 採点編成 + 再接続タイマー + CPU 駆動。
 * socket 非依存（配送は cb 経由）。state を変更する処理はすべて run() を通す。
 * ワイヤ契約: attackPairs で採点した results は同一バトル局面に resolveTurn で適用する
 * （reset 等の割込み時はエンジンの bad_phase / result_shape で安全に破棄される）。
 */
export class Room {
  state: engine.GameState;
  lastActivity: number;

  private tokens = new Map<string, number>(); // token → seat（人間のみ）
  private graceTimers = new Map<number, NodeJS.Timeout>();
  private graceDeadlines = new Map<number, number>();
  private queue: Promise<unknown> = Promise.resolve();
  // 席番号キー。waiting 中は CPU 行動が予約されない（pokeCpu が waiting を対象外）ため removeWaiting の振り直しと衝突しない
  private cpuBusy = new Set<number>();
  private resolving = false;
  private disposed = false;
  private epoch = 0;

  constructor(
    public readonly id: string,
    config: GameConfig,
    private readonly scorer: Scorer,
    private readonly cb: RoomCallbacks,
    private readonly opts: RoomOptions = {},
  ) {
    this.state = engine.createGame(id, config);
    this.lastActivity = this.now();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }
  private touch(): void {
    this.lastActivity = this.now();
  }

  hasConnectedHumans(): boolean {
    return this.state.seats.some((s) => s.controller === 'human' && s.connected);
  }

  seatOf(token: string): number | undefined {
    return this.tokens.get(token);
  }

  private run<T>(fn: () => T | Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  private apply(r: engine.Result): boolean {
    if (!r.ok) return false;
    this.state = r.value;
    return true;
  }

  private broadcast(): void {
    const pub = engine.toPublicState(this.state);
    for (const p of pub.players) {
      p.graceDeadline = this.graceDeadlines.get(p.seat) ?? null;
    }
    this.cb.onPublic(pub);
    for (const [token, seat] of this.tokens) {
      this.cb.onPrivate(seat, engine.toPrivateView(this.state, seat, token));
    }
  }

  /** socket 層が bind 後に最新ビューを届け直すための公開口 */
  refresh(): Promise<void> {
    return this.run(() => this.broadcast());
  }

  // ---- 参加・CPU 追加・開始 ----

  join(name: string, token?: string): Promise<engine.Result<JoinResult>> {
    return this.run(() => {
      this.touch();
      if (token !== undefined && this.tokens.has(token)) {
        const seat = this.tokens.get(token) as number;
        this.clearGrace(seat);
        this.apply(engine.setConnected(this.state, seat, true));
        if (engine.getSeat(this.state, seat)?.controller === 'cpu') {
          this.apply(engine.setController(this.state, seat, 'human'));
        }
        this.broadcast();
        return engine.ok<JoinResult>({ seat, token, rejoined: true });
      }
      if (engine.isFull(this.state)) return engine.err<JoinResult>('room_full', '満席です');
      const r = engine.addPlayer(this.state, name);
      if (!r.ok) return r as engine.Result<JoinResult>;
      this.state = r.value.state;
      const newToken = randomUUID();
      this.tokens.set(newToken, r.value.seat);
      this.maybeStart();
      this.broadcast();
      return engine.ok<JoinResult>({ seat: r.value.seat, token: newToken, rejoined: false });
    });
  }

  addCpu(bySeat: number): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      if (bySeat !== this.state.hostSeat) return engine.err('not_host', 'ホストのみ実行できます');
      const n = this.state.seats.filter((s) => s.controller === 'cpu').length;
      const r = engine.addPlayer(this.state, CPU_NAMES[n] ?? `CPU${n + 1}`, 'cpu');
      if (!r.ok) return r as engine.Result<undefined>;
      this.state = r.value.state;
      this.maybeStart();
      this.broadcast();
      return engine.ok(undefined);
    });
  }

  /** 残席を CPU で埋めて開始（ソロ導線）。ホストのみ */
  fillAndStart(bySeat: number): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      if (bySeat !== this.state.hostSeat) return engine.err('not_host', 'ホストのみ実行できます');
      let n = this.state.seats.filter((s) => s.controller === 'cpu').length;
      while (!engine.isFull(this.state)) {
        const r = engine.addPlayer(this.state, CPU_NAMES[n] ?? `CPU${n + 1}`, 'cpu');
        if (!r.ok) return r as engine.Result<undefined>;
        this.state = r.value.state;
        n++;
      }
      this.maybeStart();
      this.broadcast();
      return engine.ok(undefined);
    });
  }

  /** queue 内から呼ぶこと。満席なら theming へ進めテーマ解決を非同期起動 */
  private maybeStart(): void {
    if (this.state.phase !== 'waiting' || !engine.isFull(this.state)) return;
    if (!this.apply(engine.startTheming(this.state))) return;
    void this.resolveThemes();
  }

  private async resolveThemes(): Promise<void> {
    const epoch = this.epoch;
    const cfg = this.state.config.themes;
    const themes =
      cfg.mode === 'manual' && cfg.manual
        ? cfg.manual
        : await this.scorer.generateThemes(cfg.count);
    await this.run(() => {
      if (epoch !== this.epoch) return;
      if (this.apply(engine.applyThemes(this.state, themes))) {
        this.broadcast();
        this.pokeCpu();
      }
    });
  }

  // ---- ゲームフロー ----

  submitConcepts(seat: number, concepts: string[]): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      const r = engine.submitConcepts(this.state, seat, concepts);
      if (!r.ok) return r as engine.Result<undefined>;
      this.state = r.value;
      this.broadcast();
      void this.scoreSeat(seat, concepts);
      return engine.ok(undefined);
    });
  }

  /** 概念 × テーマの採点（キュー外）→ applyScores（キュー内）。Scorer は reject しない */
  private async scoreSeat(seat: number, concepts: string[]): Promise<void> {
    const epoch = this.epoch;
    const themes = [...this.state.themes];
    const pairs = concepts.flatMap((c) => themes.map((t) => ({ a: c, b: t })));
    const results = await this.scorer.scorePairs(pairs);
    await this.run(() => {
      if (epoch !== this.epoch) return;
      const table = concepts.map((_, i) => ({
        scores: themes.map((__, j) => results[i * themes.length + j]?.score ?? 50),
        reasons: themes.map((__, j) => results[i * themes.length + j]?.reason ?? ''),
      }));
      if (this.apply(engine.applyScores(this.state, seat, table))) {
        this.broadcast();
        this.pokeCpu();
      }
    });
  }

  pickLives(
    seat: number,
    selectedIndices: number[],
    secretIndexes: number[],
  ): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      const r = engine.pickLives(this.state, seat, selectedIndices, secretIndexes);
      if (!r.ok) return r as engine.Result<undefined>;
      this.state = r.value;
      this.broadcast();
      this.pokeCpu();
      return engine.ok(undefined);
    });
  }

  attack(seat: number, concept: string): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      const r = engine.submitAttack(this.state, seat, concept);
      if (!r.ok) return r as engine.Result<undefined>;
      this.state = r.value.state;
      this.broadcast();
      if (r.value.readyToResolve) void this.resolveTurnFlow();
      return engine.ok(undefined);
    });
  }

  private async resolveTurnFlow(): Promise<void> {
    if (this.resolving) return;
    const epoch = this.epoch;
    this.resolving = true;
    try {
      const pairs = engine.attackPairs(this.state);
      const results = await this.scorer.scorePairs(pairs.map(({ a, b }) => ({ a, b })));
      await this.run(() => {
        if (epoch !== this.epoch) return;
        if (this.apply(engine.resolveTurn(this.state, results))) {
          this.broadcast();
          this.pokeCpu();
        }
      });
    } finally {
      this.resolving = false;
      void this.run(() => {
        if (
          this.state.phase === 'battle' &&
          engine.aliveSeats(this.state).every((s) => s.attack !== null) &&
          !this.resolving
        ) {
          void this.resolveTurnFlow();
        }
      });
    }
  }

  reset(bySeat: number): Promise<engine.Result<undefined>> {
    return this.run(() => {
      this.touch();
      if (bySeat !== this.state.hostSeat) return engine.err('not_host', 'ホストのみ実行できます');
      this.epoch++;
      for (const s of [...this.graceTimers.keys()]) this.clearGrace(s);
      if (!this.apply(engine.resetGame(this.state)))
        return engine.err('internal', 'リセットに失敗しました');
      for (const s of this.state.seats) {
        if (s.controller === 'human' && !s.connected) this.scheduleGrace(s.seat);
      }
      this.maybeStart();
      this.broadcast();
      return engine.ok(undefined);
    });
  }

  // ---- 切断・再接続 ----

  disconnect(seat: number): Promise<void> {
    return this.run(() => {
      this.touch();
      const st = engine.getSeat(this.state, seat);
      if (!st) return;
      this.apply(engine.setConnected(this.state, seat, false));
      if (this.state.phase === 'waiting') {
        this.removeWaiting(seat);
      } else if (this.state.phase !== 'finished' && st.controller === 'human') {
        // finished 後は代打不要（猶予タイマーを残すとテスト/GC の後始末を汚す）
        this.scheduleGrace(seat);
      }
      this.broadcast();
    });
  }

  /** GC・テスト用: 保持タイマーを全破棄し、以降の CPU スケジューリングも停止する */
  dispose(): void {
    this.disposed = true;
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    this.graceDeadlines.clear();
  }

  /** waiting 中の退室: 席を詰め、token / grace の席番号を振り直す */
  private removeWaiting(seat: number): void {
    if (!this.apply(engine.removePlayer(this.state, seat))) return;
    for (const [token, s] of [...this.tokens]) {
      if (s === seat) this.tokens.delete(token);
      else if (s > seat) this.tokens.set(token, s - 1);
    }
    const entries = [...this.graceTimers];
    for (const [s, timer] of entries) {
      if (s === seat) {
        clearTimeout(timer);
        this.graceTimers.delete(s);
      } else if (s > seat) {
        this.graceTimers.delete(s);
        this.graceTimers.set(s - 1, timer);
      }
    }
    const deadlineEntries = [...this.graceDeadlines];
    for (const [s, deadline] of deadlineEntries) {
      if (s === seat) {
        this.graceDeadlines.delete(s);
      } else if (s > seat) {
        this.graceDeadlines.delete(s);
        this.graceDeadlines.set(s - 1, deadline);
      }
    }
  }

  private scheduleGrace(seat: number): void {
    this.clearGrace(seat);
    const timer = setTimeout(() => {
      void this.run(() => {
        this.graceTimers.delete(seat);
        this.graceDeadlines.delete(seat);
        const st = engine.getSeat(this.state, seat);
        if (!st || st.connected || st.controller !== 'human') return;
        if (this.apply(engine.setController(this.state, seat, 'cpu'))) {
          this.broadcast();
          this.pokeCpu();
        }
      });
    }, this.state.config.graceSeconds * 1000);
    this.graceTimers.set(seat, timer);
    this.graceDeadlines.set(seat, this.now() + this.state.config.graceSeconds * 1000);
  }

  private clearGrace(seat: number): void {
    const t = this.graceTimers.get(seat);
    if (t) {
      clearTimeout(t);
      this.graceTimers.delete(seat);
    }
    this.graceDeadlines.delete(seat);
  }

  // ---- CPU 駆動 ----

  private cpuDelay(): number {
    const { min, max } = this.opts.cpuDelayMs ?? { min: 1000, max: 3000 };
    return min + Math.random() * (max - min);
  }

  /**
   * 現フェーズで行動が必要な CPU 席に遅延付き行動を予約（多重予約は cpuBusy で防止）。
   * cpuBusy は「タイマーが発火するまで」だけを守る（=setTimeout 発火時に即クリア）。
   * cpuAct の完了（=攻撃提出→resolveTurnFlow 完了）まで busy を引きずると、
   * battle は同一フェーズ内で複数ラウンドを跨ぐため、resolveTurnFlow 内の pokeCpu が
   * 「自分の攻撃が引き金になった解決」の直後に呼ばれた際、cpuAct の finally（busy 解除）
   * より先に走ってしまい、次ラウンドの同じ CPU 席が二度と再予約されず対局が止まる
   * （攻撃→resolveTurnFlow起動→run()キュー経由のpokeCpu が、cpuAct 側の
   * await this.attack() 継続より必ず先に処理される、という Promise 解決順に起因）。
   */
  private pokeCpu(): void {
    if (this.disposed) return;
    for (const st of this.state.seats) {
      if (st.controller !== 'cpu' || !st.alive || this.cpuBusy.has(st.seat)) continue;
      const needs =
        (this.state.phase === 'submitting' && st.submittedConcepts === null) ||
        (this.state.phase === 'picking' && st.lives === null) ||
        (this.state.phase === 'battle' && st.attack === null);
      if (!needs) continue;
      this.cpuBusy.add(st.seat);
      setTimeout(() => {
        this.cpuBusy.delete(st.seat);
        if (this.disposed) return;
        void this.cpuAct(st.seat);
      }, this.cpuDelay());
    }
  }

  private async cpuAct(seat: number): Promise<void> {
    const st = engine.getSeat(this.state, seat);
    if (!st || st.controller !== 'cpu' || !st.alive) return;
    const phase = this.state.phase;
    if (phase === 'submitting' && st.submittedConcepts === null) {
      const avoid = [
        ...this.state.seats.flatMap((s) => s.submittedConcepts ?? []),
        ...this.state.themes,
      ];
      const concepts = await this.scorer.generateConcepts(
        [...this.state.themes],
        this.state.config.conceptsPerPlayer,
        avoid,
      );
      await this.submitConcepts(seat, concepts);
    } else if (phase === 'picking' && st.lives === null) {
      const candidates = st.candidates ?? [];
      // ライフの分散: 候補同士の関連度をペア採点し、1 撃で複数枚壊されない離れた組を選ばせる
      const pairScore = await this.candidatePairScores(candidates);
      const pick = decidePick(
        candidates,
        this.state.config.maxLives,
        this.state.config.allSecret,
        pairScore,
      );
      if (pick) await this.pickLives(seat, pick.selectedIndices, pick.secretIndexes);
    } else if (phase === 'battle' && st.attack === null) {
      // 攻撃の繰り返し防止: 過去の全攻撃・同ターンの提出済み攻撃・破壊済み概念・テーマ語。
      // 自席の残ライフ概念は decideAttack 側でも禁止語 + 実採点の自己検査で守られる
      const avoid = [
        ...new Set([
          ...this.state.turns.flatMap((t) => t.attacks.map((a) => a.concept)),
          ...this.state.seats.flatMap((s) => (s.attack !== null ? [s.attack] : [])),
          ...this.state.turns.flatMap((t) => t.destroys.map((d) => d.concept)),
          ...this.state.themes,
        ]),
      ];
      const remaining = (s: (typeof this.state.seats)[number]): string[] => [
        ...(s.lives?.open ?? []),
        ...(s.lives?.secrets.filter((x) => !x.destroyed).map((x) => x.concept) ?? []),
      ];
      const ctx = {
        themes: [...this.state.themes],
        ownLives: remaining(st),
        opponents: this.state.seats
          .filter((s) => s.alive && s.seat !== seat)
          .map((s) => ({
            seat: s.seat,
            name: s.name,
            livesRemaining: remaining(s).length,
            openLives: [...(s.lives?.open ?? [])],
          })),
        clues: this.collectClues(seat),
        avoid,
        destroyThreshold: this.state.config.destroyThreshold,
      };
      let attack = await decideAttack(this.scorer, ctx);
      // 生成中に他 CPU が同じ攻撃を提出していたら 1 回だけ作り直す
      // （複数 CPU の cpuAct は並行して走るため、avoid 構築時点では互いの攻撃が見えない）
      const dupNow = (): boolean =>
        this.state.seats.some((s) => s.seat !== seat && s.attack === attack);
      if (dupNow()) {
        const latest = this.state.seats.flatMap((s) => (s.attack !== null ? [s.attack] : []));
        attack = await decideAttack(this.scorer, {
          ...ctx,
          avoid: [...new Set([...avoid, ...latest, attack])],
        });
      }
      await this.attack(seat, attack);
    }
  }

  /** 候補同士の関連度行列（対称・対角 100）。CPU 選抜の分散判断に使う */
  private async candidatePairScores(candidates: ScoredCandidate[]): Promise<number[][]> {
    const n = candidates.length;
    const pairs: { a: string; b: string; i: number; j: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push({
          a: candidates[i]?.concept ?? '',
          b: candidates[j]?.concept ?? '',
          i,
          j,
        });
      }
    }
    const matrix: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 100 : 0)),
    );
    if (!pairs.length) return matrix;
    const scored = await this.scorer.scorePairs(pairs.map((p) => ({ a: p.a, b: p.b })));
    pairs.forEach((p, k) => {
      const v = scored[k]?.score ?? 0;
      const row = matrix[p.i];
      const col = matrix[p.j];
      if (row) row[p.j] = v;
      if (col) col[p.i] = v;
    });
    return matrix;
  }

  /**
   * 判定録から逆算できる手掛かりを集める: 相手の未破壊 SECRET ごとに「過去の攻撃語 × 関連度」。
   * targetOrdinal は現在の open 数 + secrets の元位置で照合する（allSecret では常に安定。
   * legacy モードで open が減った場合は過去ターンの序数とずれ得るが、手掛かりはヒューリスティックとして許容）
   */
  private collectClues(seat: number): SecretClue[] {
    const clues: SecretClue[] = [];
    for (const s of this.state.seats) {
      if (!s.alive || s.seat === seat || !s.lives) continue;
      const openLen = s.lives.open.length;
      s.lives.secrets.forEach((sec, idx) => {
        if (sec.destroyed) return;
        const ordinal = openLen + idx;
        const hints = this.state.turns
          .flatMap((t) => t.details)
          .filter(
            (d) =>
              d.targetSeat === s.seat && d.targetKind === 'secret' && d.targetOrdinal === ordinal,
          )
          .map((d) => ({ attack: d.atkConcept, score: d.score }));
        if (hints.length)
          clues.push({ seat: s.seat, owner: s.name, life: `秘${ordinal + 1}`, hints });
      });
    }
    return clues;
  }
}
