import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule, RedisOptions } from '@nestjs-modules/ioredis';
import { CacheService } from './cache.service';

/**
 * CacheModule
 * -----------
 * Backed by Redis via `@nestjs-modules/ioredis`. Provides a single
 * {@link CacheService} that other modules can inject for `getOrSet`
 * semantics + single-flight coalescing (#107).
 *
 * Marked `@Global()` so other feature modules (Streak, Analytics, ...)
 * don't have to re-import it to use `CacheService`.
 */
@Global()
@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RedisOptions => {
        const url = configService.get<string>('cache.redisUrl');
        const host = configService.get<string>('cache.redisHost');
        const port = configService.get<number>('cache.redisPort');
        const password = configService.get<string>('cache.redisPassword');
        const db = configService.get<number>('cache.redisDb');

        return {
          type: 'single',
          url,
          host: url ? undefined : host,
          port: url ? undefined : port,
          password,
          db,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, RedisModule],
})
export class CacheModule {}
