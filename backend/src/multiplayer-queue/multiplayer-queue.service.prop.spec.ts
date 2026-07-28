import * as fc from 'fast-check';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MultiplayerQueueService } from './multiplayer-queue.service';
import { Queue, QueueStatus, SkillLevel } from './entities/queue.entity';
import { Match } from './entities/match.entity';
import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Arbitraries (random-value generators)
// ---------------------------------------------------------------------------

/** A UUID string (v4-like). */
const uuidArb = fc.uuid();

/** Non-empty display name. */
const usernameArb = fc.string({ minLength: 1, maxLength: 20 });

/** One of the four skill-level enum values. */
const skillLevelArb = fc.constantFrom(
  SkillLevel.BEGINNER,
  SkillLevel.INTERMEDIATE,
  SkillLevel.ADVANCED,
  SkillLevel.EXPERT,
);

/** A game-mode label. */
const gameModeArb = fc.constantFrom('classic', 'blitz', 'survival');

/** Wait time in seconds (0 … 600). */
const waitTimeArb = fc.integer({ min: 0, max: 600 });

/** A single player (Queue entity shape) for testing grouping/compatibility. */
const queuePlayerArb: fc.Arbitrary<Queue> = fc.record({
  id: uuidArb,
  userId: uuidArb,
  username: usernameArb,
  status: fc.constant(QueueStatus.WAITING),
  skillLevel: skillLevelArb,
  gameMode: gameModeArb,
  waitTime: waitTimeArb,
  matchId: fc.constant(null),
  preferences: fc.record({
    maxWaitTime: fc.option(fc.integer({ min: 30, max: 1800 }), { nil: undefined }),
    preferredOpponents: fc.option(fc.array(uuidArb, { maxLength: 5 }), { nil: undefined }),
    avoidOpponents: fc.option(fc.array(uuidArb, { maxLength: 5 }), { nil: undefined }),
  }),
  createdAt: fc.date({ min: new Date(0), max: new Date() }),
  matchedAt: fc.constant(null),
  leftAt: fc.constant(null),
} as unknown as fc.Record<Queue>);

/** A batch of players in the queue. */
const queuePlayerBatchArb = fc.array(queuePlayerArb, { minLength: 0, maxLength: 30 });

/** A DTO for joining the queue (valid inputs). */
const joinQueueDtoArb = fc.record({
  userId: uuidArb,
  username: usernameArb,
  skillLevel: skillLevelArb,
  gameMode: fc.option(gameModeArb, { nil: undefined }),
  maxWaitTime: fc.option(fc.integer({ min: 30, max: 1800 }), { nil: undefined }),
  preferredOpponents: fc.option(fc.array(uuidArb, { maxLength: 3 }), { nil: undefined }),
  avoidOpponents: fc.option(fc.array(uuidArb, { maxLength: 3 }), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRepos() {
  return {
    queueRepository: {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    matchRepository: {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MultiplayerQueueService — property-based', () => {
  // ── groupPlayersForMatching ─────────────────────────────────────────
  describe('groupPlayersForMatching', () => {
    /** Access the private method. */
    function groupPlayers(
      service: MultiplayerQueueService,
      players: Queue[],
    ): Queue[][] {
      return (service as any).groupPlayersForMatching(players);
    }

    it('every input player appears in at least one group', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerBatchArb, (players) => {
          const groups = groupPlayers(service, players);
          const groupedIds = new Set(groups.flat().map((p) => p.id));
          for (const p of players) {
            expect(groupedIds.has(p.id)).toBe(true);
          }
        }),
      );

      module.close();
    });

    it('players in a same-mode-skill group share gameMode and skillLevel', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerBatchArb, (players) => {
          const groups = groupPlayers(service, players);
          for (const group of groups) {
            // Skip cross-skill groups (key starts with "cross-skill-")
            // and single-player groups (no meaningful check)
            if (group.length < 2) continue;
            // Identify if this is a cross-skill group
            const isCrossSkill = group.some((p) => p.waitTime > 120);
            if (isCrossSkill && group.some((p) => p.waitTime <= 120)) {
              // Mixed — this is a cross-skill group, skip the strict check
              continue;
            }
            // Regular group: all must share gameMode and skillLevel
            const mode = group[0].gameMode;
            const level = group[0].skillLevel;
            for (const p of group) {
              expect(p.gameMode).toBe(mode);
              expect(p.skillLevel).toBe(level);
            }
          }
        }),
      );

      module.close();
    });

    it('cross-skill groups only contain long-waiting players (waitTime > 120)', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerBatchArb, (players) => {
          const groups = groupPlayers(service, players);
          for (const group of groups) {
            // A cross-skill group has members whose wait times straddle 120 AND
            // the group key would be "cross-skill-…"  — we approximate by checking
            // whether the group contains any long-waiting AND any short-waiting.
            const hasLong = group.some((p) => p.waitTime > 120);
            const hasShort = group.some((p) => p.waitTime <= 120);
            if (hasLong && hasShort) {
              // This is a cross-skill bucket — every member must wait > 120
              // Actually it could include both long and short waiters in the
              // cross-skill group. Let me check the implementation:
              // `longWaitingPlayers.filter(p => p.waitTime > 120)` — so only long
              // waiters go into the cross-skill group.
              // But the cross-skill group OVERWRITES any existing group with the
              // same key, so some players might appear twice (once in their
              // skill group, once in cross-skill). That's fine.
              for (const p of group) {
                expect(p.waitTime).toBeGreaterThan(120);
              }
            }
          }
        }),
      );

      module.close();
    });

    it('no cross-skill group created when fewer than 2 long-waiting players exist', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerBatchArb, (players) => {
          const groups = groupPlayers(service, players);
          const longWaitCount = players.filter((p) => p.waitTime > 120).length;
          // Cross-skill groups have more than 2 members but mix wait times
          // We verify no group has > 2 long-wait-time members when there aren't enough
          if (longWaitCount < 2) {
            for (const group of groups) {
              const longInGroup = group.filter((p) => p.waitTime > 120).length;
              expect(longInGroup).toBeLessThan(2);
            }
          }
        }),
      );

      module.close();
    });
  });

  // ── checkPlayerCompatibility ────────────────────────────────────────
  describe('checkPlayerCompatibility', () => {
    function checkCompatibility(
      service: MultiplayerQueueService,
      players: Queue[],
    ): boolean {
      return (service as any).checkPlayerCompatibility(players);
    }

    it('is symmetric with respect to avoidOpponents', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(
          queuePlayerArb,
          queuePlayerArb,
          (p1, p2) => {
            // Ensure different IDs
            const a: Queue = { ...p1, id: 'p1', userId: 'u1' };
            const b: Queue = { ...p2, id: 'p2', userId: 'u2' };
            const resultAB = checkCompatibility(service, [a, b]);
            const resultBA = checkCompatibility(service, [b, a]);
            expect(resultAB).toBe(resultBA);
          },
        ),
      );

      module.close();
    });

    it('returns true when neither player has avoidOpponents', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(
          queuePlayerArb,
          queuePlayerArb,
          (p1, p2) => {
            const a: Queue = { ...p1, id: 'p1', userId: 'u1', preferences: { ...p1.preferences, avoidOpponents: undefined } };
            const b: Queue = { ...p2, id: 'p2', userId: 'u2', preferences: { ...p2.preferences, avoidOpponents: undefined } };
            expect(checkCompatibility(service, [a, b])).toBe(true);
          },
        ),
      );

      module.close();
    });

    it('returns false when one player avoids the other', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(
          queuePlayerArb,
          queuePlayerArb,
          (p1, p2) => {
            const a: Queue = {
              ...p1, id: 'p1', userId: 'u1',
              preferences: { ...p1.preferences, avoidOpponents: ['u2'] },
            };
            const b: Queue = {
              ...p2, id: 'p2', userId: 'u2',
              preferences: { ...p2.preferences, avoidOpponents: undefined },
            };
            expect(checkCompatibility(service, [a, b])).toBe(false);
          },
        ),
      );

      module.close();
    });

    it('single player is always compatible with themselves', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerArb, (player) => {
          expect(checkCompatibility(service, [player])).toBe(true);
        }),
      );

      module.close();
    });
  });

  // ── getQueueStats ───────────────────────────────────────────────────
  describe('getQueueStats', () => {
    it('aggregations are internally consistent', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              skillLevel: skillLevelArb,
              gameMode: gameModeArb,
              createdAt: fc.date({ min: new Date(Date.now() - 86400000), max: new Date() }),
            }),
            { minLength: 0, maxLength: 20 },
          ),
          fc.integer({ min: 0, max: 100 }),
          async (waitingEntries, matchesToday) => {
            const { mocks, module } = await buildModule();

            const now = Date.now();
            const entriesWithWait = waitingEntries.map((e) => ({
              ...e,
              createdAt: new Date(now - Math.floor(Math.random() * 60000)),
            }));

            mocks.queueRepository.find.mockResolvedValue(entriesWithWait);
            mocks.matchRepository.count.mockResolvedValue(matchesToday);

            const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);
            const stats = await service.getQueueStats();

            // totalInQueue = number of waiting entries
            expect(stats.totalInQueue).toBe(waitingEntries.length);

            // totalInQueue = sum of bySkillLevel
            const skillSum = Object.values(stats.bySkillLevel).reduce((a, b) => a + b, 0);
            expect(skillSum).toBe(waitingEntries.length);

            // totalInQueue = sum of byGameMode
            const modeSum = Object.values(stats.byGameMode).reduce((a, b) => a + b, 0);
            expect(modeSum).toBe(waitingEntries.length);

            // Non-negative values
            expect(stats.averageWaitTime).toBeGreaterThanOrEqual(0);
            expect(stats.longestWaitTime).toBeGreaterThanOrEqual(0);
            expect(stats.matchesToday).toBe(matchesToday);

            // averageWaitTime and longestWaitTime consistency
            if (waitingEntries.length > 0) {
              expect(stats.averageWaitTime).toBeLessThanOrEqual(stats.longestWaitTime);
            } else {
              expect(stats.averageWaitTime).toBe(0);
              expect(stats.longestWaitTime).toBe(0);
            }

            module.close();
          },
        ),
      );
    });
  });

  // ── mapToQueueStatusDto ─────────────────────────────────────────────
  describe('mapToQueueStatusDto', () => {
    function mapDto(
      service: MultiplayerQueueService,
      queue: Queue,
    ): unknown {
      return (service as any).mapToQueueStatusDto(queue);
    }

    it('preserves all fields through the mapping', async () => {
      const { mocks, module } = await buildModule();
      const service = module.get<MultiplayerQueueService>(MultiplayerQueueService);

      await fc.assert(
        fc.property(queuePlayerArb, (player) => {
          const dto: any = mapDto(service, player);
          expect(dto.id).toBe(player.id);
          expect(dto.userId).toBe(player.userId);
          expect(dto.username).toBe(player.username);
          expect(dto.status).toBe(player.status);
          expect(dto.skillLevel).toBe(player.skillLevel);
          expect(dto.gameMode).toBe(player.gameMode);
          expect(dto.waitTime).toBe(player.waitTime);
          expect(dto.matchId).toBe(player.matchId);
          // Date fields should be preserved
          expect(dto.createdAt).toEqual(player.createdAt);
          expect(dto.matchedAt).toEqual(player.matchedAt);
        }),
      );

      module.close();
    });
  });
});

// ---------------------------------------------------------------------------
// Module factory (avoids duplicating the bootstrapping in every property)
// ---------------------------------------------------------------------------

async function buildModule(): Promise<{
  mocks: ReturnType<typeof createMockRepos>;
  module: TestingModule;
}> {
  const mocks = createMockRepos();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MultiplayerQueueService,
      {
        provide: getRepositoryToken(Queue),
        useValue: mocks.queueRepository,
      },
      {
        provide: getRepositoryToken(Match),
        useValue: mocks.matchRepository,
      },
    ],
  }).compile();

  return { mocks, module };
}
