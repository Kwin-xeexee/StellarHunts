import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let serviceMock: any;

  const mockReport = { id: 1, userId: 10, puzzleId: 100, status: 'OPEN' };

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn().mockResolvedValue(mockReport),
      findAll: jest.fn().mockResolvedValue([mockReport]),
      findOne: jest.fn().mockResolvedValue(mockReport),
      update: jest.fn().mockResolvedValue({ ...mockReport, status: 'IN_PROGRESS' }),
      remove: jest.fn().mockResolvedValue(undefined),
      resolve: jest.fn().mockResolvedValue({ ...mockReport, status: 'RESOLVED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates report', async () => {
    const req = { user: { id: 10 } };
    const res = await controller.create({ puzzleId: 100 } as any, req);
    expect(res).toEqual(mockReport);
    expect(serviceMock.create).toHaveBeenCalledWith({ puzzleId: 100 }, 10);
  });

  it('finds all reports', async () => {
    const res = await controller.findAll();
    expect(res).toEqual([mockReport]);
  });

  it('finds one report', async () => {
    const res = await controller.findOne('1');
    expect(res).toEqual(mockReport);
  });

  it('resolves report', async () => {
    const res = await controller.resolve('1', 'Fixed');
    expect(res.status).toBe('RESOLVED');
    expect(serviceMock.resolve).toHaveBeenCalledWith(1, 'Fixed');
  });

  it('updates report', async () => {
    const res = await controller.update('1', { status: 'IN_PROGRESS' } as any);
    expect(res.status).toBe('IN_PROGRESS');
  });

  it('removes report', async () => {
    await controller.remove('1');
    expect(serviceMock.remove).toHaveBeenCalledWith(1);
  });
});
