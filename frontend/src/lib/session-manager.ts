import NodeCache from 'node-cache';
import { createClient, RedisClientOptions, RedisClientType } from 'redis';
// LOCAL DEVELOPMENT ONLY — restore this import before committing.
// import type {
//   ServerCacheWithPspFactoryStorage,
//   NormalizedMSIDToken,
//   MSIDJwtToken
// } from '@uhg-optum-coreplatform/security-as-a-service-pkg';
type NormalizedMSIDToken = Record<string, unknown>;
type MSIDJwtToken = Record<string, unknown>;
type ServerCacheWithPspFactoryStorage<T, U> = { token?: T; pspToken?: U };

interface GlobalObj {
  memState?: NodeCache;
}

interface StateManager<T> {
  keyExists(key: string): Promise<boolean>;
  setValue(key: string, expiration: number, value: T | unknown[]): Promise<string>;
  getValue(key: string): Promise<T | null | undefined>;
  clearValue(key: string): void;
  updateValueTtl(key: string, ttl: number): void;
}

type StateManagerAsync<T> = { init(): Promise<unknown> } & StateManager<T>;

interface ErrorLike {
  message: string;
  code: string;
  input?: string;
}

class MemoryManager<T> implements StateManager<T> {
  state: NodeCache;
  constructor() {
    this.state = (global as GlobalObj)['memState'] || new NodeCache();
    (global as GlobalObj)['memState'] = this.state;
  }
  async keyExists(key: string) {
    return Promise.resolve(this.state.has(key));
  }
  async setValue(key: string, _exp: number, value: unknown[] | T) {
    return Promise.resolve(this.state.set(key, value) ? 'true' : 'false');
  }
  async getValue(key: string) {
    return Promise.resolve(this.state.get(key) as T);
  }
  clearValue(key: string) {
    this.state.del(key);
  }
  updateValueTtl() {
    return undefined;
  }
}

class RedisManager<T> implements StateManagerAsync<T> {
  redisClient: RedisClientType;
  constructor(opts: RedisClientOptions) {
    this.redisClient = createClient(opts) as RedisClientType;
  }
  async init(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.redisClient.on('error', (err: Error) => reject(err));
      this.redisClient
        .connect()
        .then(() => resolve(true))
        .catch((err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }
  async keyExists(key: string) {
    return !!(await this.redisClient.get(key));
  }
  async setValue(key: string, expiration: number, value: T | unknown[]) {
    return this.redisClient.set(key, JSON.stringify(value), { EX: expiration }).then((r) => r || '');
  }
  async getValue(key: string): Promise<T | null> {
    const data = await this.redisClient.get(key);
    return data ? (JSON.parse(data) as T) : null;
  }
  async clearValue(key: string) {
    return this.redisClient.del(key);
  }
  async updateValueTtl(key: string, ttl: number) {
    return this.redisClient.sendCommand(['EXPIRE', key, `${ttl}`]);
  }
}

class PersistentStateManager<T> implements StateManagerAsync<T> {
  stateManager: StateManager<T> | StateManagerAsync<T> | undefined;
  redisClientOpts: RedisClientOptions;
  initPromise: Promise<void> | undefined;
  initErrored = false;

  constructor(opts: RedisClientOptions) {
    this.redisClientOpts = opts;
  }

  createMemoryManager() {
    return new MemoryManager<T>();
  }

  async createRedisManager() {
    return new Promise<RedisManager<T>>((resolve, reject) => {
      try {
        const rm = new RedisManager<T>(this.redisClientOpts);
        rm.init()
          .then(() => resolve(rm))
          .catch((error: unknown) => {
            const err = error as ErrorLike;
            let { message } = err;
            if (err.code === 'ERR_INVALID_URL') message = `${message}: ${err.input}`;
            else if (err.code === 'ECONNRESET' || err.message.startsWith('WRONGPASS'))
              message = `${message}: ${this.redisClientOpts.url}`;
            reject(new Error(`Init Redis Error: ${message}`));
          });
      } catch (err: unknown) {
        reject(new Error(`Error creating redis manager: ${(err as ErrorLike).message}`));
      }
    });
  }

  async getStateManager() {
    return new Promise<MemoryManager<T> | RedisManager<T>>((resolve) => {
      if (!this.redisClientOpts.url) return resolve(this.createMemoryManager());
      this.createRedisManager()
        .then(resolve)
        .catch(() => resolve(this.createMemoryManager()));
    });
  }

  async getInitPromise() {
    return new Promise<void>((resolve, reject) => {
      this.getStateManager()
        .then((sm) => {
          this.stateManager = sm;
          this.initErrored = false;
          resolve();
        })
        .catch((error: unknown) => {
          this.initErrored = true;
          console.error((error as { message: string }).message);
          reject(new Error('Error creating state manager'));
        });
    });
  }

  async init() {
    if (!this.initPromise || this.initErrored) this.initPromise = this.getInitPromise();
    return this.initPromise;
  }

  async keyExists(key: string) {
    await this.init();
    if (!this.stateManager) throw new Error('State manager is not initialized');
    return (await this.stateManager.keyExists(key)) || false;
  }

  async setValue(key: string, expiration: number, value: unknown[] | T) {
    await this.init();
    if (!this.stateManager) throw new Error('State manager is not initialized');
    return (await this.stateManager.setValue(key, expiration, value)) || 'failed';
  }

  async getValue(key: string) {
    await this.init();
    if (!this.stateManager) throw new Error('State manager is not initialized');
    return this.stateManager.getValue(key);
  }

  async clearValue(key: string) {
    await this.init();
    if (!this.stateManager) throw new Error('State manager is not initialized');
    this.stateManager.clearValue(key);
  }

  async updateValueTtl(key: string, ttl: number) {
    await this.init();
    if (!this.stateManager) throw new Error('State manager is not initialized');
    this.stateManager.updateValueTtl(key, ttl);
  }
}

const redisUrl = process.env['REDIS_URL'];
const isSecure = !!redisUrl;

export const sessionManager = new PersistentStateManager<
  ServerCacheWithPspFactoryStorage<NormalizedMSIDToken, MSIDJwtToken>
>({
  // Leave url unset without REDIS_URL so getStateManager() falls back to the in-memory cache instead of dialing localhost.
  url: redisUrl ? `redis${isSecure ? 's' : ''}://${redisUrl}:${process.env['REDIS_PORT'] ?? '6379'}` : undefined,
  username: 'default',
  password: process.env['REDIS_PASS'] ?? ''
});

export default sessionManager;
