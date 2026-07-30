import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { DailyRewardService } from './daily-reward.service';
import { DailyRewardLog } from './entities/daily-reward-log.entity';

describe('DailyRewardService', () => {
  let service: DailyRewardService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((log) => Promise.resolve({ id: 'dl-1', timestamp: new Date(), ...log })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyRewardService,
        { provide: getRepositoryToken(DailyRewardLog), useValue: repoMock },
      ],
    }).compile();

    service = module.get<DailyRewardService>(DailyRewardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('claims daily check in for new user', async () => {
    repoMock.findOne.mockResolvedValue(null);

    const log = await service.dailyCheckIn('u-1');
    expect(log.streak).toBe(1);
    expect(repoMock.save).toHaveBeenCalled();
  });

  it('increments streak if checked in yesterday', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    repoMock.findOne.mockResolvedValue({ userId: 'u-1', timestamp: yesterday, streak: 3 });

    const log = await service.dailyCheckIn('u-1');
    expect(log.streak).toBe(4);
  });

  it('throws ConflictException if already checked in today', async () => {
    const today = new Date();
    repoMock.findOne.mockResolvedValue({ userId: 'u-1', timestamp: today, streak: 1 });

    await expect(service.dailyCheckIn('u-1')).rejects.toThrow(ConflictException);
  });
});