import { Test, TestingModule } from '@nestjs/testing';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

describe('ContentController', () => {
  let controller: ContentController;
  let serviceMock: any;

  const mockContent = { id: 'c-1', title: 'Content 1', topic: 'Stellar' };

  beforeEach(async () => {
    serviceMock = {
      findAll: jest.fn().mockResolvedValue([mockContent]),
      findAllByTopic: jest.fn().mockResolvedValue([mockContent]),
      findOne: jest.fn().mockResolvedValue(mockContent),
      create: jest.fn().mockResolvedValue(mockContent),
      findAllAdmin: jest.fn().mockResolvedValue([mockContent]),
      findOneAdmin: jest.fn().mockResolvedValue(mockContent),
      updateAdmin: jest.fn().mockResolvedValue({ ...mockContent, title: 'Updated' }),
      removeAdmin: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [{ provide: ContentService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ContentController>(ContentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('finds all content or by topic', async () => {
    const all = await controller.findAll();
    expect(all).toEqual([mockContent]);

    const topic = await controller.findAll('Stellar');
    expect(topic).toEqual([mockContent]);
    expect(serviceMock.findAllByTopic).toHaveBeenCalledWith('Stellar');
  });

  it('finds one content', async () => {
    const res = await controller.findOne('c-1');
    expect(res).toEqual(mockContent);
  });

  it('creates content (admin)', async () => {
    const res = await controller.create({ title: 'Content 1' } as any);
    expect(res).toEqual(mockContent);
  });

  it('finds all admin content and updates admin content', async () => {
    const adminAll = await controller.findAllAdmin();
    expect(adminAll).toEqual([mockContent]);

    const updated = await controller.updateAdmin('c-1', { title: 'Updated' } as any);
    expect(updated.title).toBe('Updated');
  });

  it('removes admin content', async () => {
    await controller.removeAdmin('c-1');
    expect(serviceMock.removeAdmin).toHaveBeenCalledWith('c-1');
  });
});