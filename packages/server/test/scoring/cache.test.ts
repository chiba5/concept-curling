import { describe, expect, it } from 'vitest';
import { LruCache } from '../../src/scoring/cache.js';

describe('LruCache', () => {
  it('set/get の基本動作', () => {
    const c = new LruCache<number>(3);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('x')).toBeUndefined();
  });
  it('上限超過で最も古いキーを追い出す', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });
  it('get で鮮度が更新される（LRU）', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a を最新化
    c.set('c', 3); // b が追い出される
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });
  it('既存キーの set は上書きで、サイズは増えない', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('a', 9);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(9);
  });
});
