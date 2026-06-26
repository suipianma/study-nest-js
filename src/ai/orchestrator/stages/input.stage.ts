import { BadRequestException, Injectable } from '@nestjs/common';
import { PromptTemplateService } from '../../prompt-template.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { PromptGuardService } from '../../../security/prompt-guard.service';
import { ConversationService } from '../../../conversation/conversation.service';
import { SummaryService } from '../../../conversation/summary.service';
import { TitleService } from '../../../conversation/title.service';
import { SUMMARY_TRIGGER } from '../../../conversation/constants';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class InputStage implements PipelineStage {
  readonly name = 'input';

  constructor(
    private readonly conversationService: ConversationService,
    private readonly summaryService: SummaryService,
    private readonly titleService: TitleService,
    private readonly promptTemplateService: PromptTemplateService,
    private readonly promptGuard: PromptGuardService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async execute(ctx: PipelineContext, input: PipelineInput): Promise<void> {
    const validation = this.promptGuard.validateUserInput(
      input.content.trim(),
      this.toolRegistry.getKnownToolNames(),
    );
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    ctx.sanitizedContent = validation.sanitized;
    const trimmedPromptId = input.promptId?.trim();
    ctx.usePrompt = Boolean(trimmedPromptId);
    ctx.promptId = trimmedPromptId;
    ctx.knowledgeBaseIds = input.knowledgeBaseIds;

    await this.conversationService.findOneOrFail(
      input.conversationId,
      input.userId,
    );
    await this.conversationService.assertMessageLimit(input.conversationId);

    let messagesBefore = await this.conversationService.getMessages(
      input.conversationId,
      input.userId,
    );
    const userCountBefore = messagesBefore.filter((m) => m.role === 'user').length;

    let messageContent = ctx.sanitizedContent;

    if (input.isRegenerate) {
      const last = messagesBefore[messagesBefore.length - 1];
      if (last?.role === 'assistant') {
        await this.conversationService.deleteMessage(
          input.conversationId,
          input.userId,
          last.id,
        );
        messagesBefore = messagesBefore.slice(0, -1);
      } else if (!last || last.role !== 'user') {
        throw new BadRequestException('当前无法重新生成');
      }

      const lastUser = messagesBefore[messagesBefore.length - 1];
      if (!lastUser || lastUser.role !== 'user') {
        throw new BadRequestException('找不到对应的用户消息');
      }

      const trimmedInput = ctx.sanitizedContent.trim();
      messageContent =
        trimmedInput && trimmedInput !== lastUser.content
          ? trimmedInput
          : lastUser.content;

      if (messageContent !== lastUser.content) {
        await this.conversationService.updateUserMessageContent(
          input.conversationId,
          input.userId,
          lastUser.id,
          messageContent,
        );
      }
    } else {
      if (ctx.usePrompt && trimmedPromptId) {
        const template = this.promptTemplateService.findById(trimmedPromptId);
        if (!template) {
          throw new BadRequestException('模板不存在');
        }
        if (userCountBefore === 0) {
          await this.conversationService.bindPromptTemplate(
            input.conversationId,
            template.id,
          );
          messageContent = this.promptTemplateService.formatUserMessage(
            template,
            ctx.sanitizedContent,
          );
        }
      }

      await this.conversationService.createUserMessage(
        input.conversationId,
        messageContent,
      );

      if (userCountBefore === 0) {
        await this.conversationService.updateTitleDirect(
          input.conversationId,
          this.titleService.truncateTitle(messageContent),
        );
      }
    }

    ctx.messageContent = messageContent;

    let conversation = await this.conversationService.findOneOrFail(
      input.conversationId,
      input.userId,
    );
    let messages = await this.conversationService.getMessages(
      input.conversationId,
      input.userId,
    );

    if (
      messages.length > SUMMARY_TRIGGER &&
      !conversation.summary &&
      this.summaryService.needsSummary(conversation, messages)
    ) {
      await this.summaryService.generateInitialSummary(input.conversationId);
      conversation = await this.conversationService.findOneOrFail(
        input.conversationId,
        input.userId,
      );
      messages = await this.conversationService.getMessages(
        input.conversationId,
        input.userId,
      );
    }

    ctx.conversation = conversation;
    ctx.messages = messages;
    ctx.summary = conversation.summary;
    ctx.isFirstAiReply =
      messages.filter((m) => m.role === 'assistant').length === 0;
  }
}
