import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Config } from './config.js';
import { TokenManager } from './auth.js';
import { RateLimiter } from './rate-limiter.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES_429 = 2;

export class ApiClient {
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;

  constructor(
    private readonly cfg: Config,
    private readonly tokens: TokenManager,
  ) {
    this.limiter = new RateLimiter(8);
    this.http = axios.create({
      baseURL: cfg.baseUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'User-Agent': cfg.userAgent,
        Accept: 'application/json',
      },
      validateStatus: () => true,
    });
  }

  async get<T = any>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: 'GET', url: path, params });
  }

  async post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', url: path, data: body });
  }

  async patch<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', url: path, data: body });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', url: path });
  }

  private async request<T>(req: AxiosRequestConfig, attempt = 0): Promise<T> {
    await this.limiter.acquire();
    const token = await this.tokens.getAccessToken();
    const headers = { ...(req.headers || {}), Authorization: `Bearer ${token}` };
    if (process.env.QUINBOOK_DEBUG) {
      const safeHeaders = { ...headers, Authorization: 'Bearer ***' };
      process.stderr.write(`[api] ${req.method} ${req.url} headers=${JSON.stringify(safeHeaders)}\n`);
    }
    const res = await this.http.request<T>({ ...req, headers });
    if (process.env.QUINBOOK_DEBUG) {
      process.stderr.write(`[api] ${req.method} ${req.url} → ${res.status} req-headers-sent=${JSON.stringify(res.config.headers)}\n`);
    }

    if (res.status === 401 && attempt === 0) {
      await this.tokens.forceRefresh();
      return this.request<T>(req, attempt + 1);
    }

    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const retryAfter = Number(res.headers['retry-after']) || 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request<T>(req, attempt + 1);
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      throw new ApiError(res.status, `${req.method} ${req.url} → ${res.status}: ${body}`);
    }

    return res.data as T;
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
