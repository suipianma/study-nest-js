import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentRouterService } from '../../agent/agent-router.service';
import { AgentRouteMode } from '../../agent/agent-context.type';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ContextComposerService } from '../../../context-engine/context-composer.service';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class ToolStage implements PipelineStage {
  readonly name = 'tool';

  constructor(
    private readonly agentRouter: AgentRouterService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly contextComposer: ContextComposerService,
    private readonly config: ConfigService,
  ) {}

  async execute(ctx: PipelineContext, input: PipelineInput): Promise<void> {
    ctx.ollamaMessages = this.contextComposer.compose(ctx.contextPlan);

    const forcedMode = this.config.get<string>('AGENT_ROUTER_MODE')?.trim();
    let routeMode: AgentRouteMode;
    if (forcedMode === 'direct' || forcedMode === 'agent') {
      routeMode = forcedMode;
    } else {
      routeMode = await this.agentRouter.route(ctx.sanitizedContent);
    }

    ctx.routeMode = routeMode;
    ctx.executionMode = routeMode === 'agent' ? 'agent' : 'direct';
    ctx.agentContext = {
      userId: input.userId,
      role: input.role,
      knowledgeBaseIds: ctx.knowledgeBaseIds ?? [],
    };
    this.toolRegistry.setAgentContext(ctx.agentContext);
  }
}
