import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MultiplayerQueueService } from './multiplayer-queue.service';
import { Queue, QueueStatus, SkillLevel } from './entities/queue.entity';
import { Match } from './entities/match.entity';

describe('MultiplayerQueueService', () => {
  let service: MultiplayerQueueService;
  let queueRepoMock: any;
  let matchRepoMock: any;
  let dataSourceMock: any;

  const mockEntry: any = {
    id: 'q-1',
    userId: 'u-1',
    username: 'Alice',
    skillLevel: SkillLevel.INTERMEDIATE,
    gameMode: 'classic',
    status: QueueStatus.WAITING,
    waitTime: 10,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    queueRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...mockEntry, ...dto })),
      save: jest.fn().mockImplementation((q) => Promise.resolve(Array.isArray(q) ? q : { ...mockEntry, ...q })),
      find: jest.fn().mockResolvedValue([mockEntry]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    matchRepoMock = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(5),
    };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb) => cb({
        create: jest.fn().mockImplementation((entity, dto) => ({ id: 'm-1', ...dto })),
        save: jest.fn().mockImplementation((item) => Promise.resolve(Array.isArray(item) ? item : { id: 'm-1', ...item })),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiplayerQueueService,
        { provide: getRepositoryToken(Queue), useValue: queueRepoMock },
        { provide: getRepositoryToken(Match), useValue: matchRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<MultiplayerQueueService>(MultiplayerQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('joinQueue', () => {
    it('joins queue successfully when user is not already in queue', async () => {
      queueRepoMock.findOne.mockResolvedValue(null);

      const status = await service.joinQueue({
        userId: 'u-1',
        username: 'Alice',
        skillLevel: SkillLevel.INTERMEDIATE,
      });

      expect(status.userId).toBe('u-1');
      expect(queueRepoMock.save).toHaveBeenCalled();
    });

    it('throws BadRequestException if user is already in queue', async () => {
      queueRepoMock.findOne.mockResolvedValue(mockEntry);

      await expect(service.joinQueue({
        userId: 'u-1',
        username: 'Alice',
        skillLevel: SkillLevel.INTERMEDIATE,
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('leaveQueue', () => {
    it('leaves queue successfully', async () => {
      queueRepoMock.findOne.mockResolvedValue(mockEntry);
      await service.leaveQueue('u-1');
      expect(queueRepoMock.save).toHaveBeenCalled();
    });

    it('throws NotFoundException if user not found in queue', async () => {
      queueRepoMock.findOne.mockResolvedValue(null);
      await expect(service.leaveQueue('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQueueStatus & getQueueList & getQueueStats', () => {
    it('returns queue status for user', async () => {
      queueRepoMock.findOne.mockResolvedValue(mockEntry);
      const res = await service.getQueueStatus('u-1');
      expect(res?.userId).toBe('u-1');
    });

    it('returns null if user not in queue', async () => {
      queueRepoMock.findOne.mockResolvedValue(null);
      const res = await service.getQueueStatus('unknown');
      expect(res).toBeNull();
    });

    it('returns queue stats', async () => {
      queueRepoMock.find.mockResolvedValue([mockEntry]);
      const stats = await service.getQueueStats();
      expect(stats.totalInQueue).toBe(1);
      expect(stats.matchesToday).toBe(5);
    });
  });

  describe('getMatch', () => {
    it('returns match by id', async () => {
      matchRepoMock.findOne.mockResolvedValue({ id: 'm-1', playerIds: ['u-1', 'u-2'] });
      const match = await service.getMatch('m-1');
      expect(match.matchId).toBe('m-1');
    });

    it('throws NotFoundException if match not found', async () => {
      matchRepoMock.findOne.mockResolvedValue(null);
      await expect(service.getMatch('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupOldEntries', () => {
    it('should delete entries older than one day with status LEFT', async () => {
      queueRepoMock.delete.mockResolvedValue({ affected: 3 });

      await service.cleanupOldEntries();

      expect(queueRepoMock.delete).toHaveBeenCalledTimes(1);
      const deleteCall = queueRepoMock.delete.mock.calls[0][0];
      expect(deleteCall.status).toBe(QueueStatus.LEFT);
    });
  });
});
