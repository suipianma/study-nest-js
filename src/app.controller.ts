import { Controller, Get } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
  constructor(private redisService: RedisService) {}

  @Get()
  async test() {
    await this.redisService.redis.set('name', 'test');

    return this.redisService.redis.get('name');
  }
}
