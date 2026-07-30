import { Test, TestingModule } from '@nestjs/testing';
import { DailyRewardController } from './daily-reward.controller';
import { DailyRewardService } from './daily-reward.service';

describe('DailyRewardController', () => {
  let controller: DailyRewardController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      dailyCheckIn: jest.fn().mockResolvedValue({ id: 'dl-1', streak: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DailyRewardController],
      providers: [{ provide: DailyRewardService, useValue: serviceMock }],
    }).compile();

    controller = module.get<DailyRewardController>(DailyRewardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('claims daily check in', async () => {
    const res = await controller.dailyCheckIn({ userId: 'u-1' } as any);
    expect(res.streak).toBe(1);
    expect(serviceMock.dailyCheckIn).toHaveBeenCalledWith('u-1');
  });
});