export class RateLimiter {
  private queue: (() => void)[] = [];
  private timestamps: number[] = [];

  constructor(private readonly maxPerSec: number) {}

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 1000);

    while (this.queue.length > 0 && this.timestamps.length < this.maxPerSec) {
      const next = this.queue.shift()!;
      this.timestamps.push(Date.now());
      next();
    }

    if (this.queue.length > 0) {
      const oldest = this.timestamps[0];
      const wait = Math.max(10, 1000 - (now - oldest));
      setTimeout(() => this.drain(), wait);
    }
  }
}
