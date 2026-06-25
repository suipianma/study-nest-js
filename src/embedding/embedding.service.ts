import {
  BadGatewayException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OllamaEmbeddingReply {
  embedding?: number[];
}

@Injectable()
export class EmbeddingService {
  constructor(private readonly configService: ConfigService) {}

  private get baseUrl() {
    return (
      this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'
    );
  }

  private get model() {
    return this.configService.get<string>('OLLAMA_EMBED_MODEL') ?? 'nomic-embed-text';
  }

  async embed(text: string): Promise<number[]> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new RequestTimeoutException('向量化超时，请稍后重试');
      }
      throw new BadGatewayException(
        '无法连接 Ollama 向量服务，请确认 OLLAMA_URL 配置正确',
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Ollama embeddings 请求失败(${response.status}): ${message || '未知错误'}`,
      );
    }

    const json = (await response.json()) as OllamaEmbeddingReply;
    if (!json.embedding || json.embedding.length === 0) {
      throw new BadGatewayException('Ollama embeddings 返回为空');
    }

    return json.embedding;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const text of texts) {
      vectors.push(await this.embed(text));
    }
    return vectors;
  }
}
