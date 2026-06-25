import { RetrievalService } from '../../../knowledge-base/retrieval.service';
import { AgentContext } from '../../agent/agent-context.type';
import { ToolDefinition } from '../types/tool.type';

export function createKnowledgeBaseSearchTool(
  retrievalService: RetrievalService,
  getContext: () => AgentContext,
): ToolDefinition {
  return {
    name: 'searchKnowledgeBase',
    description: '从用户已选知识库中检索与问题相关的文档片段',
    parameters: [
      { name: 'query', description: '检索问题', required: true },
    ],
    execute: async (args) => {
      const ctx = getContext();
      if (!ctx.knowledgeBaseIds.length) {
        return '未选择知识库，请让用户在聊天页勾选知识库后重试。';
      }
      const chunks = await retrievalService.search(
        args.query,
        ctx.knowledgeBaseIds,
        { userId: ctx.userId, role: ctx.role },
      );
      return JSON.stringify({
        count: chunks.length,
        chunks: chunks.map((c) => ({
          documentName: c.documentName,
          page: c.page,
          content: c.content.slice(0, 500),
          score: c.score,
        })),
      });
    },
  };
}
