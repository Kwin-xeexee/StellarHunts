import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AchievementService } from './achievements.service';
import { Achievement, RuleType } from './entities/achievement.entity';
import { PlayerAchievement } from './entities/player-achievements.entity';

describe('AchievementService', () => {
  let service: AchievementService;
  let achievementRepoMock: any;
  let playerAchievementRepoMock: any;

  beforeEach(async () => {
    achievementRepoMock = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'ach-1',
          title: 'Speed Demon',
          ruleType: RuleType.PUZZLE_COMPLETION_TIME,
          ruleValue: { maxTime: 30 },
        },
      ]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((item) => Promise.resolve({ id: 'ach-1', ...item })),
    };

    playerAchievementRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((item) => Promise.resolve({ id: 'pa-1', ...item })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementService,
        { provide: getRepositoryToken(Achievement), useValue: achievementRepoMock },
        { provide: getRepositoryToken(PlayerAchievement), useValue: playerAchievementRepoMock },
      ],
    }).compile();

    service = module.get<AchievementService>(AchievementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('gets player achievements', async () => {
    await service.getPlayerAchievements('player-1');
    expect(playerAchievementRepoMock.find).toHaveBeenCalledWith({
      where: { playerId: 'player-1' },
      relations: ['achievement'],
      order: { earnedAt: 'DESC' },
    });
  });

  it('processes game event and awards achievement when rule matches', async () => {
    await service.processGameEvent({
      playerId: 'player-1',
      eventType: 'puzzle_completed',
      metadata: { completionTime: 20 },
    });

    expect(playerAchievementRepoMock.save).toHaveBeenCalled();
  });

  it('does not award achievement if already earned', async () => {
    playerAchievementRepoMock.findOne.mockResolvedValue({ id: 'pa-existing' });

    await service.processGameEvent({
      playerId: 'player-1',
      eventType: 'puzzle_completed',
      metadata: { completionTime: 20 },
    });

    expect(playerAchievementRepoMock.save).not.toHaveBeenCalled();
  });

  it('initializes default achievements if missing', async () => {
    await service.initializeDefaultAchievements();
    expect(achievementRepoMock.save).toHaveBeenCalled();
  });
});
