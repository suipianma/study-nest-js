import { BadGatewayException, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = new EmbeddingService({
      get: (key: string) => {
        if (key === 'OLLAMA_URL') return 'http://127.0.0.1:11434';
        if (key === 'OLLAMA_EMBED_MODEL') return 'test-model';
        return undefined;
      },
    } as ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('embed 应返回向量', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    } as Response);

    await expect(service.embed('hello')).resolves.toEqual([0.1, 0.2, 0.3]);
  });

  it('embed 请求超时应抛错', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    );

    await expect(service.embed('hello')).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
  });

  it('embed 非 200 响应应抛错', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    } as Response);

    await expect(service.embed('hello')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
