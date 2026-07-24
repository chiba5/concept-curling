import { describe, expect, it, vi } from 'vitest';
import { OpenAIScorer } from '../../src/scoring/openai.js';
import { ResilientScorer, createScorerFromEnv } from '../../src/scoring/index.js';
import { DemoScorer } from '../../src/scoring/demo.js';

/** OpenAI chat.completions 形式のモック応答を作る */
function openaiResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );
}

const opts = (fetchFn: typeof fetch) => ({
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  timeoutMs: 500,
  fetchFn,
});

describe('OpenAIScorer', () => {
  it('scorePairs: 応答の i/score/reason を対応付け、範囲外はクランプする', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      openaiResponse({
        pairs: [
          { i: 0, score: 150, reason: '同一概念' },
          { i: 1, score: -5, reason: '別領域' },
        ],
      }),
    );
    const s = new OpenAIScorer(opts(fetchFn as typeof fetch));
    const r = await s.scorePairs([
      { a: '灯台', b: '灯台' },
      { a: '灯台', b: '簿記' },
    ]);
    expect(r.get(0)).toEqual({ score: 100, reason: '同一概念' });
    expect(r.get(1)).toEqual({ score: 0, reason: '別領域' });
    // プロンプトはサーバ構築・JSON mode を要求している
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.model).toBe('gpt-4o-mini');
  });
  it('HTTP エラーは 1 回リトライし、2 回失敗で throw', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const s = new OpenAIScorer(opts(fetchFn as typeof fetch));
    await expect(s.scorePairs([{ a: 'x', b: 'y' }])).rejects.toThrow('OpenAI HTTP 429');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('generateThemes: themes 配列を返し、形が壊れていれば throw', async () => {
    const good = new OpenAIScorer(
      opts(vi.fn().mockResolvedValue(openaiResponse({ themes: ['星座', '航海'] })) as typeof fetch),
    );
    await expect(good.generateThemes(2)).resolves.toEqual(['星座', '航海']);
    const bad = new OpenAIScorer(
      opts(vi.fn().mockResolvedValue(openaiResponse({ themes: ['星座'] })) as typeof fetch),
    );
    await expect(bad.generateThemes(2)).rejects.toThrow();
  });
  it('generateThemes: 重複したテーマ応答は throw する', async () => {
    const dup = new OpenAIScorer(
      opts(vi.fn().mockResolvedValue(openaiResponse({ themes: ['星座', '星座'] })) as typeof fetch),
    );
    await expect(dup.generateThemes(2)).rejects.toThrow();
  });
  it('timeout: never-resolve な fetch は attempt ごとに abort され、リトライ後 throw する', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const s = new OpenAIScorer({
        ...opts(fetchFn as unknown as typeof fetch),
        timeoutMs: 100,
      });
      const p = s.scorePairs([{ a: 'x', b: 'y' }]);
      const assertion = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(250);
      await assertion;
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ResilientScorer', () => {
  const pairs = [
    { a: '灯台', b: '星座' },
    { a: '簿記', b: '星座' },
  ];
  it('primary 成功時はその結果を返し、キャッシュして 2 回目は fetch しない', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      openaiResponse({
        pairs: [
          { i: 0, score: 40, reason: '航路の目印' },
          { i: 1, score: 85, reason: '別領域' },
        ],
      }),
    );
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const r1 = await s.scorePairs(pairs);
    expect(r1.map((x) => x.score)).toEqual([40, 85]);
    const r2 = await s.scorePairs(pairs);
    expect(r2).toEqual(r1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('primary が throw したら demo で全穴埋めし、reject しない', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const r = await s.scorePairs([{ a: '灯台', b: '灯台' }]);
    expect(r).toEqual([{ score: 85, reason: '簡易採点' }]);
  });
  it('primary の欠損インデックスは demo で穴埋めされる', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(openaiResponse({ pairs: [{ i: 0, score: 40, reason: 'r' }] }));
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const r = await s.scorePairs([
      { a: '灯台', b: '星座' },
      { a: '灯台', b: '灯台' },
    ]);
    expect(r[0]).toEqual({ score: 40, reason: 'r' });
    expect(r[1]).toEqual({ score: 85, reason: '簡易採点' });
  });
  it('generateConcepts は個数・重複・空文字を保証する（primary が壊れた配列を返しても）', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(openaiResponse({ concepts: ['灯台', '灯台', ' ', '簿記'] }));
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const c = await s.generateConcepts(['星座'], 5, []);
    expect(c).toHaveLength(5);
    expect(new Set(c).size).toBe(5);
    expect(c.every((x) => x.trim().length > 0)).toBe(true);
  });
  it('generateConcepts は avoid に含まれる概念を primary/demo どちらの結果からも除外する', async () => {
    const fetchFn = vi.fn().mockResolvedValue(openaiResponse({ concepts: ['灯台', '羊皮紙'] }));
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const c = await s.generateConcepts(['星座'], 3, ['灯台']);
    expect(c).not.toContain('灯台');
    expect(c).toHaveLength(3);
    expect(new Set(c).size).toBe(3);
  });
  it('primary 無し（demo 単独）でも全メソッドが動く', async () => {
    const s = new ResilientScorer(null, new DemoScorer(), { provider: 'demo', model: 'demo' });
    await expect(s.scorePairs([{ a: 'x', b: 'x' }])).resolves.toEqual([
      { score: 85, reason: '簡易採点' },
    ]);
    await expect(s.generateThemes(2)).resolves.toHaveLength(2);
    await expect(s.generateAttack(['星座'], ['灯台'])).resolves.toBeTruthy();
  });
  it('demo 穴埋め結果はキャッシュされず、復旧後に primary で再採点される', async () => {
    const fetchFn = vi
      .fn()
      // OpenAIScorer は 1 回リトライ（計 2 attempts）するため、初回呼び出しを 2 連続で失敗させる
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(openaiResponse({ pairs: [{ i: 0, score: 40, reason: '回復' }] }));
    const s = new ResilientScorer(
      new OpenAIScorer(opts(fetchFn as typeof fetch)),
      new DemoScorer(),
      { provider: 'openai', model: 'gpt-4o-mini' },
    );
    const r1 = await s.scorePairs([{ a: '灯台', b: '星座' }]);
    expect(r1[0]?.reason).toBe('簡易採点');
    const r2 = await s.scorePairs([{ a: '灯台', b: '星座' }]);
    expect(r2[0]).toEqual({ score: 40, reason: '回復' });
  });
});

describe('createScorerFromEnv', () => {
  it('SCORING_PROVIDER=demo なら demo 単独', () => {
    const s = createScorerFromEnv({ SCORING_PROVIDER: 'demo', OPENAI_API_KEY: 'sk-x' });
    expect(s.providerName).toBe('demo');
  });
  it('キーがあれば既定で openai、無ければ demo', () => {
    expect(createScorerFromEnv({ OPENAI_API_KEY: 'sk-x' }).providerName).toBe('openai');
    expect(createScorerFromEnv({}).providerName).toBe('demo');
  });
  it('空文字の env 値は未設定として扱う', () => {
    const s = createScorerFromEnv({ SCORING_PROVIDER: '', OPENAI_API_KEY: 'sk-x' });
    expect(s.providerName).toBe('openai');
    expect(createScorerFromEnv({ SCORING_PROVIDER: '', OPENAI_API_KEY: '' }).providerName).toBe(
      'demo',
    );
  });
});
