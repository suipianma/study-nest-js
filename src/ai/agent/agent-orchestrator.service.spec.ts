import { MessageEvent, of } from 'rxjs';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentContext } from './agent-context.type';

describe('AgentOrchestratorService', () => {
  const aiService = { chat: jest.fn(), streamChat: jest.fn() };
  const toolPrompt = { build: jest.fn(() => 'tool-system') };
  const parser = { parse: jest.fn() };
  const registry = {
    setAgentContext: jest.fn(),
    getKnownToolNames: jest.fn(() => new Set(['weather'])),
    execute: jest.fn(),
  };

  let service: AgentOrchestratorService;
  const agentContext: AgentContext = {
    userId: 1,
    role: 'user',
    knowledgeBaseIds: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentOrchestratorService(
      aiService as any,
      toolPrompt as any,
      parser as any,
      registry as any,
    );
  });

  it('无工具调用时应发送 agent_start 并完成流式输出', (done) => {
    aiService.chat.mockResolvedValue({ thinking: '', response: '你好呀' });
    parser.parse.mockReturnValue(null);
    aiService.streamChat.mockReturnValue(
      of({ data: { response: '你好呀', done: true } } as MessageEvent),
    );

    const events: Record<string, unknown>[] = [];
    service
      .streamWithAgent([{ role: 'user', content: '你好' }], null, agentContext)
      .subscribe({
        next: (event) => events.push((event as MessageEvent).data as object),
        complete: () => {
          expect(events[0]).toMatchObject({ phase: 'agent_start' });
          expect(events.some((item) => item.phase === 'agent_done')).toBe(true);
          expect(events.some((item) => item.done)).toBe(true);
          done();
        },
        error: done.fail,
      });
  });

  it('单步工具后应触发 tool_call 并流式总结', (done) => {
    aiService.chat
      .mockResolvedValueOnce({
        thinking: '',
        response: '{"tool":"weather","city":"武汉"}',
      })
      .mockResolvedValueOnce({ thinking: '', response: '武汉天气不错' });
    parser.parse
      .mockReturnValueOnce({
        tool: 'weather',
        args: { city: '武汉' },
        raw: '{"tool":"weather","city":"武汉"}',
      })
      .mockReturnValueOnce(null);
    registry.execute.mockResolvedValue('武汉 31℃');
    aiService.streamChat.mockReturnValue(
      of({ data: { response: '武汉 31℃', done: true } } as MessageEvent),
    );

    const events: Record<string, unknown>[] = [];
    service
      .streamWithAgent(
        [{ role: 'user', content: '武汉天气' }],
        null,
        agentContext,
      )
      .subscribe({
        next: (event) => events.push((event as MessageEvent).data as object),
        complete: () => {
          expect(events.some((item) => item.phase === 'tool_call')).toBe(true);
          expect(events.some((item) => item.phase === 'tool_result')).toBe(true);
          expect(registry.execute).toHaveBeenCalledWith('weather', {
            city: '武汉',
          });
          done();
        },
        error: done.fail,
      });
  });
});
