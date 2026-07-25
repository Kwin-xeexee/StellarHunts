import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('in-memory fallback (no REDIS_URL)', () => {
    it('records solves to the in-memory mirror and aggregates correctly', async () => {
      await service.recordPuzzleSolveAsync('u1', 'pA', 100);
      await service.recordPuzzleSolveAsync('u1', 'pA', 200);
      await service.recordPuzzleSolveAsync('u2', 'pB', 50);

      const sorted = await service.getMostSolvedPuzzlesAsync();
      expect(sorted).toEqual([
        { puzzleId: 'pA', solveCount: 2 },
        { puzzleId: 'pB', solveCount: 1 },
      ]);

      await expect(service.getAverageSolveTimeAsync('pA')).resolves.toBe(150);
      await expect(service.getAverageSolveTimeAsync('pB')).resolves.toBe(50);
      await expect(service.getAverageSolveTimeAsync('unknown')).resolves.toBe(
        0,
      );

      const u1History = await service.getUserPuzzleStatsAsync('u1');
      expect(u1History.get('pA')).toMatchObject({
        solveCount: 2,
        totalSolveTime: 300,
        attempts: 2,
      });
      expect(u1History.get('pA')?.lastSolved).toBeInstanceOf(Date);
    });

    it('records every solve exactly once (no double-increment in mirror)', async () => {
      await service.recordPuzzleSolveAsync('u1', 'pA', 100);
      await service.recordPuzzleSolve('u1', 'pA', 100);
      const sorted = await service.getMostSolvedPuzzlesAsync();
      expect(sorted).toEqual([{ puzzleId: 'pA', solveCount: 2 }]);
    });
  });
});
