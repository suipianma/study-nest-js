import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './e2e-app.factory';

describe('Chat flow (e2e)', () => {
  let app: INestApplication<App>;
  const username = `e2e_${Date.now()}`;
  const password = 'testpass123';

  beforeAll(async () => {
    app = await createE2eApp({ mockOrchestrator: true });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('注册 → 登录 → 建会话 → ticket → SSE → 拉历史', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);

    const accessToken = loginRes.body.data.accessToken as string;
    expect(accessToken).toBeTruthy();

    const convRes = await request(app.getHttpServer())
      .post('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const conversationId = convRes.body.data.id as number;
    expect(conversationId).toBeGreaterThan(0);

    const ticketRes = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/stream/ticket`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const ticket = ticketRes.body.data.ticket as string;
    expect(ticket).toBeTruthy();

    const streamRes = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/stream`)
      .query({ content: 'E2E 你好', ticket })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(String(streamRes.text)).toContain('done');

    const messagesRes = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const messages = messagesRes.body.data.items as Array<{
      role: string;
      content: string;
    }>;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.role === 'user' && m.content.includes('E2E'))).toBe(
      true,
    );
  });

  it('无 ticket 访问 stream 应返回 401', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);

    const accessToken = loginRes.body.data.accessToken as string;
    const convRes = await request(app.getHttpServer())
      .post('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const conversationId = convRes.body.data.id as number;

    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/stream`)
      .query({ content: 'hello' })
      .expect(401);
  });
});
