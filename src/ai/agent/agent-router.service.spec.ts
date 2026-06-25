import { AgentRouterService } from './agent-router.service';

describe('AgentRouterService', () => {
  const aiService = { chat: jest.fn() };
  let service: AgentRouterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentRouterService(aiService as any);
  });

  it('问候语应路由为 direct', async () => {
    const mode = await service.route('你好');
    expect(mode).toBe('direct');
    expect(aiService.chat).not.toHaveBeenCalled();
  });

  it('复杂任务应路由为 agent', async () => {
    aiService.chat.mockResolvedValue({
      thinking: '',
      response: '{"mode":"agent"}',
    });
    const mode = await service.route('读取 docs 目录下的设计文档并总结');
    expect(mode).toBe('agent');
  });
});
