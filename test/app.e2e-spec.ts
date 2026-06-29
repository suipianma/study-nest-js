import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './e2e-app.factory';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('/metrics (GET) 应返回 Prometheus 文本', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/);
  });

  it('/ai/mcp/health (GET) 应返回 MCP 状态', () => {
    return request(app.getHttpServer())
      .get('/ai/mcp/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('enabled');
        expect(res.body).toHaveProperty('status');
      });
  });
});
