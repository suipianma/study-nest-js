import { ToolStage } from './tool.stage';
import { createEmptyPipelineContext } from '../types/pipeline-context.type';

describe('ToolStage', () => {
  const agentRouter = { route: jest.fn() };
  const toolRegistry = { setAgentContext: jest.fn() };
  const contextComposer = { compose: jest.fn(() => [{ role: 'user', content: 'hi' }]) };
  const config = { get: jest.fn() };

  let stage: ToolStage;

  beforeEach(() => {
    jest.clearAllMocks();
    stage = new ToolStage(
      agentRouter as any,
      toolRegistry as any,
      contextComposer as any,
      config as any,
    );
  });

  it('AGENT_ROUTER_MODE=direct 时应强制 direct 执行', async () => {
    config.get.mockReturnValue('direct');
    const ctx = createEmptyPipelineContext();
    ctx.sanitizedContent = '读取文件';
    ctx.knowledgeBaseIds = [3];
    ctx.contextPlan = { selectedBlocks: [] } as any;

    await stage.execute(ctx, {
      conversationId: 1,
      userId: 2,
      role: 'user',
      content: '读取文件',
      knowledgeBaseIds: [3],
    });

    expect(agentRouter.route).not.toHaveBeenCalled();
    expect(ctx.executionMode).toBe('direct');
    expect(ctx.agentContext).toEqual({
      userId: 2,
      role: 'user',
      knowledgeBaseIds: [3],
    });
    expect(toolRegistry.setAgentContext).toHaveBeenCalledWith(ctx.agentContext);
    expect(contextComposer.compose).toHaveBeenCalled();
  });

  it('auto 模式下应调用 AgentRouter', async () => {
    config.get.mockReturnValue('auto');
    agentRouter.route.mockResolvedValue('agent');
    const ctx = createEmptyPipelineContext();
    ctx.sanitizedContent = '分析文档';
    ctx.contextPlan = { selectedBlocks: [] } as any;

    await stage.execute(ctx, {
      conversationId: 1,
      userId: 2,
      role: 'admin',
      content: '分析文档',
    });

    expect(agentRouter.route).toHaveBeenCalledWith('分析文档');
    expect(ctx.executionMode).toBe('agent');
    expect(ctx.routeMode).toBe('agent');
  });
});
