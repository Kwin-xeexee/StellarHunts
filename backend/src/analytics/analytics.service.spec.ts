import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined), // No REDIS_URL -> in-memory
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordPuzzleSolve & recordPuzzleSolveAsync', () => {
    it('records puzzle solve in memory', async () => {
      service.recordPuzzleSolve('user1', 'p1', 100);
      const avg = service.getAverageSolveTime('p1');
      expect(avg).toBe(100);

      await service.recordPuzzleSolveAsync('user1', 'p1', 200);
      const avg2 = service.getAverageSolveTime('p1');
      expect(avg2).toBe(150);
    });
  });

  describe('getMostSolvedPuzzles & getMostSolvedPuzzlesAsync', () => {
    it('returns sorted most solved puzzles', async () => {
      service.recordPuzzleSolve('user1', 'p1', 100);
      service.recordPuzzleSolve('user2', 'p1', 120);
      service.recordPuzzleSolve('user1', 'p2', 50);

      const syncRes = await service.getMostSolvedPuzzles();
      expect(syncRes[0].puzzleId).toBe('p1');
      expect(syncRes[0].solveCount).toBe(2);

      const asyncRes = await service.getMostSolvedPuzzlesAsync(1);
      expect(asyncRes).toHaveLength(1);
      expect(asyncRes[0].puzzleId).toBe('p1');
    });
  });

  describe('getAverageSolveTime & getAverageSolveTimeAsync', () => {
    it('returns 0 for non-existent puzzle', async () => {
      expect(service.getAverageSolveTime('none')).toBe(0);
      expect(await service.getAverageSolveTimeAsync('none')).toBe(0);
    });
  });

  describe('getUserPuzzleStats & getUserPuzzleStatsAsync', () => {
    it('returns user puzzle engagement map', async () => {
      service.recordPuzzleSolve('userA', 'p1', 60);
      const syncStats = service.getUserPuzzleStats('userA');
      expect(syncStats.get('p1')?.solveCount).toBe(1);

      const asyncStats = await service.getUserPuzzleStatsAsync('userA');
      expect(asyncStats.get('p1')?.solveCount).toBe(1);

      const emptyStats = service.getUserPuzzleStats('unknown');
      expect(emptyStats.size).toBe(0);
    });
  });

  describe('seedData', () => {
    it('seeds test data successfully', () => {
      service.seedData();
      const avg = service.getAverageSolveTime('puzzleA');
      expect(avg).toBeGreaterThan(0);
    });
  });
});
