import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => ({
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT) || 6379,
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: parseInt(process.env.REDIS_DB) || 0,
  redisUrl: process.env.REDIS_URL,
}));
