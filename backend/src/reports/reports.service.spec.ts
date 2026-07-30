import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Report, ReportStatus, ReportType } from './entities/report.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let repoMock: any;

  const mockReport: any = {
    id: 1,
    userId: 10,
    puzzleId: 100,
    type: ReportType.BUG,
    description: 'Broken puzzle',
    status: ReportStatus.OPEN,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    repoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 1, ...r })),
      find: jest.fn().mockResolvedValue([mockReport]),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: repoMock },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates report if not existing', async () => {
      repoMock.findOne.mockResolvedValue(null);

      const res = await service.create({ puzzleId: 100, type: ReportType.BUG, description: 'Broken' } as any, 10);
      expect(res.status).toBe(ReportStatus.OPEN);
      expect(repoMock.save).toHaveBeenCalled();
    });

    it('throws BadRequestException if user already reported puzzle', async () => {
      repoMock.findOne.mockResolvedValue(mockReport);

      await expect(service.create({ puzzleId: 100, type: ReportType.BUG, description: 'Broken' } as any, 10))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne & update & status transitions', () => {
    it('returns report when found', async () => {
      repoMock.findOne.mockResolvedValue(mockReport);
      const res = await service.findOne(1);
      expect(res.id).toBe(1);
    });

    it('throws NotFoundException when report not found', async () => {
      repoMock.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('triages report', async () => {
      repoMock.findOne.mockResolvedValue(mockReport);
      const res = await service.triage(1, 'Need more info');
      expect(res.status).toBe(ReportStatus.TRIAGED);
      expect(res.adminNote).toBe('Need more info');
    });

    it('resolves report', async () => {
      repoMock.findOne.mockResolvedValue(mockReport);
      const res = await service.resolve(1, 'Fixed');
      expect(res.status).toBe(ReportStatus.RESOLVED);
    });

    it('rejects report', async () => {
      repoMock.findOne.mockResolvedValue(mockReport);
      const res = await service.reject(1, 'Invalid');
      expect(res.status).toBe(ReportStatus.REJECTED);
    });
  });
});
