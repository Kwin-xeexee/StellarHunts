import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ContentService } from './content.service';
import { Content } from './content.entity';

describe('ContentService', () => {
  let service: ContentService;
  let repoMock: any;

  const mockContent: any = {
    id: 'c-1',
    title: 'Content 1',
    body: 'Body',
    topic: 'Stellar',
    isActive: true,
  };

  beforeEach(async () => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => ({ ...mockContent, ...dto })),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ ...mockContent, ...c })),
      find: jest.fn().mockResolvedValue([mockContent]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: getRepositoryToken(Content), useValue: repoMock },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates content', async () => {
    const res = await service.create({ title: 'Content 1' } as any);
    expect(res.title).toBe('Content 1');
  });

  it('finds all active content and by topic', async () => {
    const resAll = await service.findAll();
    expect(resAll).toEqual([mockContent]);

    const resTopic = await service.findAllByTopic('Stellar');
    expect(resTopic).toEqual([mockContent]);
  });

  it('finds one content or throws NotFoundException', async () => {
    repoMock.findOne.mockResolvedValue(mockContent);
    const res = await service.findOne('c-1');
    expect(res.id).toBe('c-1');

    repoMock.findOne.mockResolvedValue(null);
    await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
  });

  it('updates content', async () => {
    repoMock.findOne.mockResolvedValue(mockContent);
    const res = await service.update('c-1', { title: 'Updated' } as any);
    expect(res.title).toBe('Updated');
  });

  it('removes content', async () => {
    repoMock.findOne.mockResolvedValue(mockContent);
    await service.remove('c-1');
    expect(repoMock.remove).toHaveBeenCalled();
  });
});