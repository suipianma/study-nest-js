import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Observable,
  defer,
  from,
  switchMap,
} from 'rxjs';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { PromptGuardService } from '../security/prompt-guard.service';
import { ContextComposerService } from '../context-engine/context-composer.service';
import { ContextEngineService } from '../context-engine/context-engine.service';
import { ConversationStreamService } from './conversation-stream.service';
import { ConversationService } from './conversation.service';
import { StreamSessionService } from './stream-session.service';
import { SummaryService } from './summary.service';
import { TitleService } from './title.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtQueryGuard } from './guards/jwt-query.guard';
import { SUMMARY_TRIGGER } from './constants';

interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

@Controller('conversations')
@ApiTags('会话模块')
@ApiBearerAuth()
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationStreamService: ConversationStreamService,
    private readonly streamSessionService: StreamSessionService,
    private readonly contextEngine: ContextEngineService,
    private readonly contextComposer: ContextComposerService,
    private readonly summaryService: SummaryService,
    private readonly titleService: TitleService,
    private readonly promptTemplateService: PromptTemplateService,
    private readonly promptGuard: PromptGuardService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取会话列表' })
  findAll(@Req() req: Request & { user: JwtPayload }) {
    return this.conversationService.findAllByUser(req.user.userId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '新建会话' })
  create(@Req() req: Request & { user: JwtPayload }) {
    return this.conversationService.create(req.user.userId);
  }

  @Get('stats/token-usage')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取当前用户 token 消耗统计' })
  getTokenUsage(@Req() req: Request & { user: JwtPayload }) {
    return this.conversationService.getTokenUsageStats(req.user.userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '重命名会话' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.updateTitle(
      +id,
      req.user.userId,
      dto.title,
    );
  }

  @Delete('all')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '删除当前用户全部会话' })
  async removeAll(@Req() req: Request & { user: JwtPayload }) {
    const deleted = await this.conversationService.removeAllByUser(
      req.user.userId,
    );
    return { deleted };
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '删除会话' })
  remove(@Param('id') id: string, @Req() req: Request & { user: JwtPayload }) {
    return this.conversationService.remove(+id, req.user.userId);
  }

  @Get(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '分页获取会话消息' })
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Query('beforeId') beforeId: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.getMessagesPaginated(+id, req.user.userId, {
      limit: limit ? +limit : undefined,
      beforeId: beforeId ? +beforeId : undefined,
    });
  }

  @Get(':id/stream/active')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取当前会话进行中的流式任务快照' })
  async getActiveStream(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const conversationId = +id;
    await this.conversationService.findOneOrFail(conversationId, req.user.userId);
    const session = await this.streamSessionService.getActiveSession(
      conversationId,
      req.user.userId,
    );
    if (!session) {
      return null;
    }
    return this.conversationStreamService.toPublicSnapshot(session);
  }

  @Delete(':id/stream')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '停止当前进行中的流式生成' })
  async cancelStream(
    @Param('id') id: string,
    @Query('streamId') streamId: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const resumeStreamId = streamId?.trim();
    if (!resumeStreamId) {
      throw new BadRequestException('streamId 不能为空');
    }
    await this.conversationStreamService.cancelGeneration(
      resumeStreamId,
      +id,
      req.user.userId,
    );
    return { ok: true };
  }

  @Sse(':id/stream')
  @SkipThrottle()
  @UseGuards(JwtQueryGuard, AuthGuard('jwt'))
  @ApiOperation({ summary: '流式发送消息并获取 AI 回复（支持 streamId 续传）' })
  stream(
    @Param('id') id: string,
    @Query('content') content: string | undefined,
    @Query('streamId') streamId: string | undefined,
    @Query('promptId') promptId: string | undefined,
    @Query('knowledgeBaseIds') knowledgeBaseIdsRaw: string | string[] | undefined,
    @Query('regenerate') regenerateRaw: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ): Observable<MessageEvent> {
    const conversationId = +id;
    const userId = req.user.userId;
    const resumeStreamId = streamId?.trim();
    const isRegenerate = regenerateRaw === '1' || regenerateRaw === 'true';

    if (resumeStreamId) {
      return defer(() =>
        from(this.attachStream(conversationId, userId, resumeStreamId)),
      ).pipe(switchMap((obs) => obs));
    }

    if (!content?.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const knowledgeBaseIds = this.parseKnowledgeBaseIds(knowledgeBaseIdsRaw);
    const validation = this.promptGuard.validateUserInput(
      content.trim(),
      this.toolRegistry.getKnownToolNames(),
    );
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    return defer(() =>
      from(
        this.prepareStream(
          conversationId,
          userId,
          validation.sanitized,
          promptId,
          knowledgeBaseIds,
          req.user,
          isRegenerate,
        ),
      ),
    ).pipe(switchMap((obs) => obs));
  }

  private async attachStream(
    conversationId: number,
    userId: number,
    streamId: string,
  ): Promise<Observable<MessageEvent>> {
    const session = await this.streamSessionService.getSession(streamId);
    if (!session) {
      throw new NotFoundException('流会话不存在或已过期');
    }
    if (session.conversationId !== conversationId || session.userId !== userId) {
      throw new ForbiddenException('无权访问该流会话');
    }
    return this.conversationStreamService.observeSession(
      streamId,
      conversationId,
      userId,
    );
  }

  /** 流式发送编排：写消息 → 组装上下文 → 流式回复 → 持久化 */
  private async prepareStream(
    conversationId: number,
    userId: number,
    content: string,
    promptId?: string,
    knowledgeBaseIds?: number[],
    currentUser?: JwtPayload,
    isRegenerate = false,
  ): Promise<Observable<MessageEvent>> {
    await this.conversationService.findOneOrFail(conversationId, userId);
    await this.conversationService.assertMessageLimit(conversationId);

    let messagesBefore = await this.conversationService.getMessages(
      conversationId,
      userId,
    );
    const assistantCountBefore = messagesBefore.filter(
      (m) => m.role === 'assistant',
    ).length;
    const userCountBefore = messagesBefore.filter(
      (m) => m.role === 'user',
    ).length;

    let messageContent = content;
    const trimmedPromptId = promptId?.trim();
    const usePrompt = Boolean(trimmedPromptId);

    if (isRegenerate) {
      const last = messagesBefore[messagesBefore.length - 1];
      if (last?.role === 'assistant') {
        await this.conversationService.deleteMessage(
          conversationId,
          userId,
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

      const trimmedInput = content.trim();
      messageContent =
        trimmedInput && trimmedInput !== lastUser.content
          ? trimmedInput
          : lastUser.content;

      if (messageContent !== lastUser.content) {
        await this.conversationService.updateUserMessageContent(
          conversationId,
          userId,
          lastUser.id,
          messageContent,
        );
      }
    } else {
      if (usePrompt) {
        const template = this.promptTemplateService.findById(trimmedPromptId!);
        if (!template) throw new BadRequestException('模板不存在');
        if (userCountBefore === 0) {
          await this.conversationService.bindPromptTemplate(
            conversationId,
            template.id,
          );
          messageContent = this.promptTemplateService.formatUserMessage(
            template,
            content,
          );
        }
      }
      await this.conversationService.createUserMessage(
        conversationId,
        messageContent,
      );

      if (userCountBefore === 0) {
        await this.conversationService.updateTitleDirect(
          conversationId,
          this.titleService.truncateTitle(messageContent),
        );
      }
    }

    let conversation = await this.conversationService.findOneOrFail(
      conversationId,
      userId,
    );
    let messages = await this.conversationService.getMessages(
      conversationId,
      userId,
    );

    // 首次超阈值且无摘要 → 同步生成初始摘要
    if (
      messages.length > SUMMARY_TRIGGER &&
      !conversation.summary &&
      this.summaryService.needsSummary(conversation, messages)
    ) {
      await this.summaryService.generateInitialSummary(conversationId);
      conversation = await this.conversationService.findOneOrFail(
        conversationId,
        userId,
      );
      messages = await this.conversationService.getMessages(
        conversationId,
        userId,
      );
    }

    const contextPlan = await this.contextEngine.buildPlan(conversation, messages, {
      injectPrompt: usePrompt,
      promptId: trimmedPromptId,
      knowledgeBaseIds,
      currentUser: currentUser
        ? { userId: currentUser.userId, role: currentUser.role }
        : undefined,
    });
    const ollamaMessages = this.contextComposer.compose(contextPlan);
    const isFirstAiReply =
      messages.filter((m) => m.role === 'assistant').length === 0;

    const session = await this.streamSessionService.createSession({
      conversationId,
      userId,
      userMessageContent: messageContent,
      isFirstAiReply,
    });

    this.conversationStreamService.startDetachedGeneration({
      streamId: session.streamId,
      conversationId,
      userMessageContent: messageContent,
      isFirstAiReply,
      contextPlan,
      ollamaMessages,
      summary: conversation.summary,
    });

    return this.conversationStreamService.observeSession(
      session.streamId,
      conversationId,
      userId,
    );
  }

  private parseKnowledgeBaseIds(
    raw: string | string[] | undefined,
  ): number[] | undefined {
    if (raw === undefined) {
      return undefined;
    }

    const segments = (Array.isArray(raw) ? raw : [raw]).flatMap((item) => {
      const trimmed = item.trim();
      if (!trimmed) {
        return [];
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((value) => String(value));
          }
        } catch {
          throw new BadRequestException('knowledgeBaseIds 参数格式错误');
        }
      }
      return trimmed.split(',');
    });

    if (segments.length === 0) {
      return undefined;
    }

    const parsedIds = segments.map((segment) => {
      const value = Number(segment.trim());
      if (!Number.isInteger(value) || value <= 0) {
        throw new BadRequestException('knowledgeBaseIds 必须为正整数数组');
      }
      return value;
    });

    return [...new Set(parsedIds)];
  }
}
