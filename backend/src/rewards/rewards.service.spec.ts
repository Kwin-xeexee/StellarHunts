import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { Reward, RewardType } from './entities/reward.entity';
import { RewardClaim } from './entities/reward-claim.entity';

describe('RewardsService', () => {
  let service: RewardsService;
  let rewardRepoMock: any;
  let claimRepoMock: any;

  const mockReward: any = {
    id: 'r-1',
    name: 'Legendary Badge',
    type: RewardType.BADGE,
    challengeId: 'ch-1',
    maxClaims: 10,
    currentClaims: 2,
    isActive: true,
  };

  const mockClaim: any = {
    id: 'rc-1',
    userId: 'u-1',
    rewardId: 'r-1',
    challengeId: 'ch-1',
    status: 'claimed',
  };

  beforeEach(async () => {
    rewardRepoMock = {
      create: jest.fn().mockImplementation((dto) => ({ ...mockReward, ...dto })),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ ...mockReward, ...r })),
      find: jest.fn().mockResolvedValue([mockReward]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    claimRepoMock = {
      create: jest.fn().mockImplementation((dto) => ({ ...mockClaim, ...dto })),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ ...mockClaim, ...c })),
      find: jest.fn().mockResolvedValue([mockClaim]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: getRepositoryToken(Reward), useValue: rewardRepoMock },
        { provide: getRepositoryToken(RewardClaim), useValue: claimRepoMock },
      ],
    }).compile();

    service = module.get<RewardsService>(RewardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReward & getAllRewards', () => {
    it('creates a reward', async () => {
      const res = await service.createReward({ name: 'Badge', type: RewardType.BADGE, challengeId: 'ch-1' } as any);
      expect(res.name).toBe('Badge');
    });

    it('gets all rewards', async () => {
      const res = await service.getAllRewards();
      expect(res).toEqual([mockReward]);
    });
  });

  describe('getRewardById & getRewardByChallengeId', () => {
    it('gets reward by id', async () => {
      rewardRepoMock.findOne.mockResolvedValue(mockReward);
      const res = await service.getRewardById('r-1');
      expect(res.id).toBe('r-1');
    });

    it('throws NotFoundException if reward not found', async () => {
      rewardRepoMock.findOne.mockResolvedValue(null);
      await expect(service.getRewardById('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('claimReward', () => {
    it('claims reward successfully', async () => {
      claimRepoMock.findOne.mockResolvedValue(null); // not claimed yet
      rewardRepoMock.findOne.mockResolvedValue(mockReward); // reward exists

      const res = await service.claimReward({ userId: 'u-1', challengeId: 'ch-1' });
      expect(res.status).toBe('claimed');
      expect(rewardRepoMock.update).toHaveBeenCalled();
    });

    it('throws ConflictException if already claimed', async () => {
      claimRepoMock.findOne.mockResolvedValue(mockClaim); // already claimed

      await expect(service.claimReward({ userId: 'u-1', challengeId: 'ch-1' })).rejects.toThrow(ConflictException);
    });
  });

  describe('getUserClaims & deleteReward', () => {
    it('gets user claims', async () => {
      const res = await service.getUserClaims('u-1');
      expect(res).toEqual([mockClaim]);
    });

    it('deletes reward when no claims exist', async () => {
      rewardRepoMock.findOne.mockResolvedValue(mockReward);
      claimRepoMock.count.mockResolvedValue(0);

      await service.deleteReward('r-1');
      expect(rewardRepoMock.update).toHaveBeenCalledWith('r-1', { isActive: false });
    });
  });
});