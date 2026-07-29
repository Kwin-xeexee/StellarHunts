import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      seedData: jest.fn(),
      recordPuzzleSolveAsync: jest.fn().mockResolvedValue(undefined),
      getMostSolvedPuzzlesAsync: jest.fn().mockResolvedValue([{ puzzleId: 'p1', solveCount: 5 }]),
      getAverageSolveTimeAsync: jest.fn().mockResolvedValue(120),
      getUserPuzzleStatsAsync: jest.fn().mockResolvedValue(new Map([['p1', { solveCount: 1, totalSolveTime: 120, attempts: 1 }]])),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls seedData onModuleInit', () => {
    controller.onModuleInit();
    expect(serviceMock.seedData).toHaveBeenCalled();
  });

  it('records solve', async () => {
    await controller.recordSolve({ userId: 'u1', puzzleId: 'p1', solveTime: 100 });
    expect(serviceMock.recordPuzzleSolveAsync).toHaveBeenCalledWith('u1', 'p1', 100);
  });

  it('gets most solved puzzles', async () => {
    const res = await controller.getMostSolvedPuzzles();
    expect(res).toHaveLength(1);
    expect(res[0].puzzleId).toBe('p1');
  });

  it('gets average solve time', async () => {
    const res = await controller.getAverageSolveTime('p1');
    expect(res).toEqual({ puzzleId: 'p1', averageSolveTime: 120 });
  });

  it('gets user puzzle history', async () => {
    const res = await controller.getUserPuzzleHistory('u1');
    expect(res['p1']).toBeDefined();
    expect(res['p1'].solveCount).toBe(1);
  });
});
