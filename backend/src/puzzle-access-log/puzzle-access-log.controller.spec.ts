import { Test, TestingModule } from '@nestjs/testing';
import { PuzzleAccessLogController } from './puzzle-access-log.controller';
import { PuzzleAccessLogService } from './puzzle-access-log.service';

describe('PuzzleAccessLogController', () => {
  let controller: PuzzleAccessLogController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      logAccess: jest.fn().mockResolvedValue({ id: 'l1', userId: 'u1', puzzleId: 'p1' }),
      getMostAccessedPuzzles: jest.fn().mockResolvedValue([{ puzzleId: 'p1', accessCount: '5' }]),
      getUniqueUsersPerPuzzle: jest.fn().mockResolvedValue({ uniqueUserCount: 3 }),
      getTimeBasedTrends: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PuzzleAccessLogController],
      providers: [{ provide: PuzzleAccessLogService, useValue: serviceMock }],
    }).compile();

    controller = module.get<PuzzleAccessLogController>(PuzzleAccessLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('logs access', async () => {
    const res = await controller.logAccess({ userId: 'u1', puzzleId: 'p1' } as any);
    expect(res.userId).toBe('u1');
    expect(serviceMock.logAccess).toHaveBeenCalled();
  });

  it('gets most accessed puzzles', async () => {
    const res = await controller.getMostAccessedPuzzles();
    expect(res).toHaveLength(1);
  });

  it('gets unique users per puzzle', async () => {
    const res = await controller.getUniqueUsersPerPuzzle('p1');
    expect(res.uniqueUserCount).toBe(3);
  });

  it('gets time based trends', async () => {
    const res = await controller.getTimeBasedTrends(7);
    expect(res).toEqual([]);
  });
});