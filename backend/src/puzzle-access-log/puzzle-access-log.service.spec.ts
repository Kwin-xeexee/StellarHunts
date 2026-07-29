import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PuzzleAccessLogService } from './puzzle-access-log.service';
import { PuzzleAccessLog } from './entities/puzzle-access-log.entity';

describe('PuzzleAccessLogService', () => {
  let service: PuzzleAccessLogService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((l) => Promise.resolve({ id: 'l-1', ...l })),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ puzzleId: 'p-1', accessCount: '5' }]),
        getRawOne: jest.fn().mockResolvedValue({ count: '3' }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleAccessLogService,
        { provide: getRepositoryToken(PuzzleAccessLog), useValue: repoMock },
      ],
    }).compile();

    service = module.get<PuzzleAccessLogService>(PuzzleAccessLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('logs access', async () => {
    const res = await service.logAccess({ userId: 'u1', puzzleId: 'p1' } as any);
    expect(res.userId).toBe('u1');
    expect(repoMock.save).toHaveBeenCalled();
  });

  it('gets most accessed puzzles', async () => {
    const res = await service.getMostAccessedPuzzles();
    expect(res[0].puzzleId).toBe('p-1');
  });

  it('gets unique users per puzzle', async () => {
    const res = await service.getUniqueUsersPerPuzzle('p1');
    expect(res.uniqueUserCount).toBe(3);
  });

  it('gets time based trends', async () => {
    const res = await service.getTimeBasedTrends(7);
    expect(res).toBeDefined();
  });
});