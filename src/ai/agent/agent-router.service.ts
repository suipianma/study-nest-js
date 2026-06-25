import { Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { resolveModelReply } from '../utils/reply.util';
import { AGENT_ROUTER_FALLBACK_MODE } from './agent.constants';
import { AgentRouteMode } from './agent-context.type';

const DIRECT_GREETING =
  /^(你好|hi|hello|在吗|谢谢|好的|嗯|哦)[!?？。~]*$/i;

@Injectable()
export class AgentRouterService {
  constructor(private readonly aiService: AiService) {}

  async route(query: string): Promise<AgentRouteMode> {
    const trimmed = query.trim();
    if (trimmed.length <= 12 && DIRECT_GREETING.test(trimmed)) {
      return 'direct';
    }

    const routerPrompt = [
      '判断用户消息是否需要多步工具推理。',
      '仅输出 JSON：{"mode":"direct"} 或 {"mode":"agent"}',
      'agent：查天气、读文件、查知识库、多步分析',
      'direct：闲聊、简单概念解释',
      '',
      `用户消息：${trimmed}`,
    ].join('\n');

    try {
      const reply = await this.aiService.chat(
        [{ role: 'user', content: routerPrompt }],
        null,
        { skipCache: true },
      );
      const resolved = resolveModelReply(reply.thinking, reply.response);
      const text = resolved.response || resolved.thinking;
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return AGENT_ROUTER_FALLBACK_MODE;
      const parsed = JSON.parse(match[0]) as { mode?: string };
      return parsed.mode === 'direct' ? 'direct' : 'agent';
    } catch {
      return AGENT_ROUTER_FALLBACK_MODE;
    }
  }
}
