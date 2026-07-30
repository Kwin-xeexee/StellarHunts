import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let redisMock: any;

  beforeEach(async () => {
    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: redisMock },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrSet', () => {
    it('returns cached value if available in Redis', async () => {
      redisMock.get.mockResolvedValue(JSON.stringify({ data: 'cached' }));
      const loader = jest.fn();

      const result = await service.getOrSet('test-key', 60, loader);
      expect(result).toEqual({ data: 'cached' });
      expect(loader).not.toHaveBeenCalled();
    });

    it('invokes loader and sets cache when cache miss', async () => {
      redisMock.get.mockResolvedValue(null);
      const loader = jest.fn().mockResolvedValue({ data: 'fresh' });

      const result = await service.getOrSet('test-key', 60, loader);
      expect(result).toEqual({ data: 'fresh' });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(redisMock.set).toHaveBeenCalled();
    });

    it('single-flights concurrent loader invocations', async () => {
      redisMock.get.mockResolvedValue(null);
      let resolveLoader: any;
      const loader = jest.fn().mockImplementation(
        () => new Promise((resolve) => { resolveLoader = resolve; }),
      );

      const p1 = service.getOrSet('single-flight-key', 60, loader);
      const p2 = service.getOrSet('single-flight-key', 60, loader);

      expect(service.inflightCount()).toBe(1);
      resolveLoader({ data: 'shared' });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toEqual({ data: 'shared' });
      expect(res2).toEqual({ data: 'shared' });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(service.inflightCount()).toBe(0);
    });

    it('falls through to loader when Redis READ fails', async () => {
      redisMock.get.mockRejectedValue(new Error('Redis error'));
      const loader = jest.fn().mockResolvedValue('fallback');

      const res = await service.getOrSet('err-key', 60, loader);
      expect(res).toBe('fallback');
      expect(loader).toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('deletes keys from Redis', async () => {
      await service.invalidate('k1', 'k2');
      expect(redisMock.del).toHaveBeenCalledWith('k1', 'k2');
    });

    it('does nothing when no keys provided', async () => {
      await service.invalidate();
      expect(redisMock.del).not.toHaveBeenCalled();
    });
  });
});
