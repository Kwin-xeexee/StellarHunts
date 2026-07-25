import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// ioredis is already a project dependency (used by the rate-limiter).
// We import lazily behind @Optional() ConfigService so that environments
// without REDIS_URL — including unit tests and the dev hot-reload path —
// stay on the existing in-memory Map without paying Redis connection cost.
import Redis from 'ioredis';

interface PuzzleStats {
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
}

interface UserPuzzleEngagement {
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
  lastSolved?: Date;
}

const PUZZLE_KEY = (puzzleId: string) => `analytics:puzzle:${puzzleId}`;
const USER_PUZZLE_KEY = (userId: string, puzzleId: string) =>
  `analytics:user:${userId}:puzzle:${puzzleId}`;
const PUZZLE_INDEX_KEY = 'analytics:puzzleids';
const userPuzzleIndexKey = (userId: string) =>
  `analytics:user:${userId}:puzzleids`;

function parseUserPuzzleStats(
  raw: Record<string, string>,
): UserPuzzleEngagement {
  return {
    solveCount: Number(raw.solveCount ?? 0),
    totalSolveTime: Number(raw.totalSolveTime ?? 0),
    attempts: Number(raw.attempts ?? 0),
    lastSolved: raw.lastSolved ? new Date(raw.lastSolved) : undefined,
  };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  /**
   * In-memory mirror. Maintained as a write-through cache so that the
   * hot read path stays O(1) once warmed, and so callers without Redis
   * (unit tests, dev) see identical semantics. Acts as the authoritative
   * fallback during a transient Redis outage.
   */
  private puzzleStats = new Map<string, PuzzleStats>();
  private userPuzzleHistory = new Map<
    string,
    Map<string, UserPuzzleEngagement>
  >();

  /**
   * When non-null, writes mirror through to Redis so multiple NestJS
   * replicas share a consistent view of analytics data. Reads go
   * through the async variants (`*Async`) which consult Redis first
   * and fall back to the in-memory mirror on failure.
   */
  private readonly redis: Redis | null;
  private readonly usingRedis: boolean;

  constructor(@Optional() configService?: ConfigService) {
    const redisUrl = configService?.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      this.usingRedis = true;
      this.redis.connect().catch((err: Error) => {
        this.logger.warn(
          `Redis connection failed for analytics (${err.message}). Writes will retry once the client reconnects; the in-memory mirror is the source of truth until then.`,
        );
      });
      this.logger.log(
        'Analytics running with Redis-backed store (multi-replica safe).',
      );
    } else {
      this.redis = null;
      this.usingRedis = false;
      this.logger.warn(
        'REDIS_URL not configured — analytics running on in-memory storage. ' +
          'Stats will not survive restarts or be shared across replicas.',
      );
    }
  }

  /**
   * Async entry point used by the controller. Mirrors writes to Redis
   * when configured; the in-memory mirror is updated first so the
   * synchronous API stays consistent within the same replica even when
   * Redis is unreachable.
   */
  async recordPuzzleSolveAsync(
    userId: string,
    puzzleId: string,
    solveTime: number,
  ): Promise<void> {
    this.recordSolveMemory(userId, puzzleId, solveTime);

    if (!this.usingRedis || !this.redis) {
      return;
    }
    try {
      await this.recordSolveRedis(userId, puzzleId, solveTime);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis write failed for analytics (in-memory state is still updated): ${message}`,
      );
    }
  }

  /**
   * Synchronous in-memory-only entry point retained for callers
   * (notably unit tests + `seedData`) that don't want to incur Redis
   * latency or handle async errors. When Redis is configured, also
   * fans out the write fire-and-forget so a configured Redis still
   * receives solves from non-awaiting callers.
   */
  recordPuzzleSolve(
    userId: string,
    puzzleId: string,
    solveTime: number,
  ): void {
    this.logger.log(
      `Recording solve: User ${userId}, Puzzle ${puzzleId}, Time ${solveTime}`,
    );
    this.recordSolveMemory(userId, puzzleId, solveTime);
    if (this.usingRedis && this.redis) {
      void this.recordSolveRedis(userId, puzzleId, solveTime).catch(
        (err: Error) => {
          this.logger.warn(
            `Redis write failed for analytics (in-memory state is still updated): ${err.message}`,
          );
        },
      );
    }
  }

  private recordSolveMemory(
    userId: string,
    puzzleId: string,
    solveTime: number,
  ): void {
    let currentPuzzleStats = this.puzzleStats.get(puzzleId);
    if (!currentPuzzleStats) {
      currentPuzzleStats = { solveCount: 0, totalSolveTime: 0, attempts: 0 };
    }
    currentPuzzleStats.solveCount++;
    currentPuzzleStats.totalSolveTime += solveTime;
    currentPuzzleStats.attempts++;
    this.puzzleStats.set(puzzleId, currentPuzzleStats);

    let currentUserPuzzles = this.userPuzzleHistory.get(userId);
    if (!currentUserPuzzles) {
      currentUserPuzzles = new Map<string, UserPuzzleEngagement>();
      this.userPuzzleHistory.set(userId, currentUserPuzzles);
    }

    let currentUserPuzzleStats = currentUserPuzzles.get(puzzleId);
    if (!currentUserPuzzleStats) {
      currentUserPuzzleStats = {
        solveCount: 0,
        totalSolveTime: 0,
        attempts: 0,
      };
    }
    currentUserPuzzleStats.solveCount++;
    currentUserPuzzleStats.totalSolveTime += solveTime;
    currentUserPuzzleStats.attempts++;
    currentUserPuzzleStats.lastSolved = new Date();
    currentUserPuzzles.set(puzzleId, currentUserPuzzleStats);
  }

  private async recordSolveRedis(
    userId: string,
    puzzleId: string,
    solveTime: number,
  ): Promise<void> {
    const redis = this.redis!;
    const lastSolved = new Date().toISOString();
    const puzzleKey = PUZZLE_KEY(puzzleId);
    const userKey = USER_PUZZLE_KEY(userId, puzzleId);
    const userIndex = userPuzzleIndexKey(userId);

    const pipeline = redis.multi();
    pipeline.hincrby(puzzleKey, 'solveCount', 1);
    pipeline.hincrby(puzzleKey, 'totalSolveTime', solveTime);
    pipeline.hincrby(puzzleKey, 'attempts', 1);
    pipeline.hset(puzzleKey, 'lastSolved', lastSolved);
    pipeline.sadd(PUZZLE_INDEX_KEY, puzzleId);

    pipeline.hincrby(userKey, 'solveCount', 1);
    pipeline.hincrby(userKey, 'totalSolveTime', solveTime);
    pipeline.hincrby(userKey, 'attempts', 1);
    pipeline.hset(userKey, 'lastSolved', lastSolved);
    pipeline.sadd(userIndex, puzzleId);

    const results = await pipeline.exec();
    this.assertPipelineOk('recordPuzzleSolveRedis', results);
  }

  /**
   * Surface per-command failures from a Redis pipeline. ioredis returns
   * each command result as a `[err, value]` tuple; we log a warn per
   * failure so malformed keys or type errors aren't silently buried.
   */
  private assertPipelineOk(
    label: string,
    results: [Error | null, unknown][] | null,
  ): void {
    if (!results) {
      return;
    }
    results.forEach(([err], idx) => {
      if (err) {
        this.logger.warn(
          `Redis pipeline command ${idx} failed for ${label}: ${err.message}`,
        );
      }
    });
  }

  /**
   * Synchronous read used by callers that cannot await. Reads only the
   * in-memory mirror; for cross-replica correctness use the async
   * variants below.
   */
  getMostSolvedPuzzles(
    limit?: number,
  ): Array<{ puzzleId: string; solveCount: number }> {
    this.logger.log('Fetching most solved puzzles...');
    const sortedPuzzles = Array.from(this.puzzleStats.entries())
      .map(([puzzleId, stats]) => ({
        puzzleId,
        solveCount: stats.solveCount,
      }))
      .sort((a, b) => b.solveCount - a.solveCount);
    return limit ? sortedPuzzles.slice(0, limit) : sortedPuzzles;
  }

  /**
   * Async read used by the HTTP controller. Reads from Redis when
   * configured (authoritative across replicas), falling back to the
   * in-memory mirror on Redis failure.
   */
  async getMostSolvedPuzzlesAsync(
    limit?: number,
  ): Promise<Array<{ puzzleId: string; solveCount: number }>> {
    if (!this.usingRedis || !this.redis) {
      return this.getMostSolvedPuzzles(limit);
    }
    try {
      const ids = await this.redis.smembers(PUZZLE_INDEX_KEY);
      const rows = await Promise.all(
        ids.map(async (puzzleId) => {
          const raw = await this.redis!.hgetall(PUZZLE_KEY(puzzleId));
          return {
            puzzleId,
            solveCount: Number(raw?.solveCount ?? 0),
          };
        }),
      );
      rows.sort((a, b) => b.solveCount - a.solveCount);
      return limit ? rows.slice(0, limit) : rows;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis read failed for analytics (falling back to in-memory): ${message}`,
      );
      return this.getMostSolvedPuzzles(limit);
    }
  }

  getAverageSolveTime(puzzleId: string): number {
    this.logger.log(`Fetching average solve time for puzzle ${puzzleId}...`);
    const stats = this.puzzleStats.get(puzzleId);
    if (stats && stats.solveCount > 0) {
      return stats.totalSolveTime / stats.solveCount;
    }
    return 0;
  }

  async getAverageSolveTimeAsync(puzzleId: string): Promise<number> {
    if (!this.usingRedis || !this.redis) {
      return this.getAverageSolveTime(puzzleId);
    }
    try {
      const raw = await this.redis.hgetall(PUZZLE_KEY(puzzleId));
      const solveCount = Number(raw?.solveCount ?? 0);
      const totalSolveTime = Number(raw?.totalSolveTime ?? 0);
      return solveCount > 0 ? totalSolveTime / solveCount : 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis read failed for analytics (falling back to in-memory): ${message}`,
      );
      return this.getAverageSolveTime(puzzleId);
    }
  }

  getUserPuzzleStats(userId: string): Map<string, UserPuzzleEngagement> {
    this.logger.log(`Fetching puzzle history for user ${userId}...`);
    return (
      this.userPuzzleHistory.get(userId) ||
      new Map<string, UserPuzzleEngagement>()
    );
  }

  async getUserPuzzleStatsAsync(
    userId: string,
  ): Promise<Map<string, UserPuzzleEngagement>> {
    if (!this.usingRedis || !this.redis) {
      return this.getUserPuzzleStats(userId);
    }
    try {
      const ids = await this.redis.smembers(userPuzzleIndexKey(userId));
      const entries = await Promise.all(
        ids.map(async (puzzleId) => {
          const raw = await this.redis!.hgetall(
            USER_PUZZLE_KEY(userId, puzzleId),
          );
          return [puzzleId, parseUserPuzzleStats(raw ?? {})] as const;
        }),
      );
      return new Map(entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis read failed for analytics (falling back to in-memory): ${message}`,
      );
      return this.getUserPuzzleStats(userId);
    }
  }

  seedData(): void {
    this.logger.log('Seeding initial analytics data...');
    // Seed directly to memory to keep the test/dev hot path deterministic;
    // when Redis is configured we don't push seed data to a shared store
    // — that's the responsibility of the real workload.
    this.recordSolveMemory('user1', 'puzzleA', 120);
    this.recordSolveMemory('user1', 'puzzleB', 180);
    this.recordSolveMemory('user2', 'puzzleA', 150);
    this.recordSolveMemory('user1', 'puzzleA', 100);
    this.recordSolveMemory('user3', 'puzzleC', 200);
    this.recordSolveMemory('user2', 'puzzleB', 220);
    this.recordSolveMemory('user3', 'puzzleA', 90);
    this.recordSolveMemory('user1', 'puzzleC', 170);
    this.logger.log('Data seeding complete.');
  }
}
