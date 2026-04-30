import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('lets requests through up to the burst limit immediately', async () => {
    const rl = new RateLimiter(3);
    const start = Date.now();
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    const elapsed = Date.now() - start;
    // Three immediate acquires should take well under 100ms (essentially zero).
    expect(elapsed).toBeLessThan(100);
  });

  it('throttles the 4th request to the next sliding-window slot', async () => {
    const rl = new RateLimiter(2);
    await rl.acquire();
    await rl.acquire();
    const start = Date.now();
    await rl.acquire(); // should wait until 1s after first acquire
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(800); // generous lower bound for CI variance
    expect(elapsed).toBeLessThan(1500);
  });
});
