import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Observable,
  catchError,
  defer,
  finalize,
  from,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { AiService } from '../ai/ai.service';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { ConversationService } from './conversation.service';
import { ContextBuilderService } from './context-builder.service';
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

interface StreamPayload {
  thinking?: string;
  response?: string;
  done?: boolean;
  fromCache?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

@Controller('conversations')
@ApiTags('会话模块')
@ApiBearerAuth()
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly summaryService: SummaryService,
    private readonly titleService: TitleService,
    private readonly aiService: AiService,
    private readonly promptTemplateService: PromptTemplateService,
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

  @Sse(':id/stream')
  @UseGuards(JwtQueryGuard, AuthGuard('jwt'))
  @ApiOperation({ summary: '流式发送消息并获取 AI 回复' })
  stream(
    @Param('id') id: string,
    @Query('content') content: string,
    @Query('promptId') promptId: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ): Observable<MessageEvent> {
    if (!content?.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const conversationId = +id;
    const userId = req.user.userId;
    const trimmedContent = content.trim();

    return defer(() =>
      from(
        this.prepareStream(conversationId, userId, trimmedContent, promptId),
      ),
    ).pipe(switchMap((obs) => obs));
  }

  /** 流式发送编排：写消息 → 组装上下文 → 流式回复 → 持久化 */
  private async prepareStream(
    conversationId: number,
    userId: number,
    content: string,
    promptId?: string,
  ): Promise<Observable<MessageEvent>> {
    await this.conversationService.findOneOrFail(conversationId, userId);
    await this.conversationService.assertMessageLimit(conversationId);

    const messagesBefore = await this.conversationService.getMessages(
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

    if (usePrompt) {
      const template = this.promptTemplateService.findById(trimmedPromptId!);
      if (!template) throw new BadRequestException('模板不存在');
      // 仅首条消息格式化存库，便于展示 Context
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

    // 首条用户消息 → 截断更新标题
    if (userCountBefore === 0) {
      await this.conversationService.updateTitleDirect(
        conversationId,
        this.titleService.truncateTitle(messageContent),
      );
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

    const ollamaMessages = this.contextBuilder.build(conversation, messages, {
      injectPrompt: usePrompt,
      promptId: trimmedPromptId,
    });
    const isFirstAiReply = assistantCountBefore === 0;

    let thinking = '';
    let response = '';
    let fromCache = false;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let finishedNormally = false;

    return this.aiService
      .streamChat(ollamaMessages, conversation.summary)
      .pipe(
        tap((event) => {
          const payload = this.parseStreamPayload(event.data);
          if (payload.thinking) thinking = payload.thinking;
          if (payload.response) response = payload.response;
          if (payload.fromCache) fromCache = true;
          if (payload.promptTokens != null) promptTokens = payload.promptTokens;
          if (payload.completionTokens != null) {
            completionTokens = payload.completionTokens;
          }
          if (payload.done) finishedNormally = true;
        }),
        catchError((err: unknown) => {
          const message = this.extractStreamErrorMessage(err);
          return of({
            data: {
              error: message,
              done: true,
            },
          } as MessageEvent);
        }),
        finalize(() => {
          const finalContent = finishedNormally
            ? response
            : response
              ? `${response}[回复中断]`
              : '[回复中断]';

          // 异步持久化，不阻塞 SSE 关闭
          void this.persistAssistantReply({
            conversationId,
            messageContent,
            finalContent,
            thinking,
            fromCache,
            promptTokens,
            completionTokens,
            isFirstAiReply,
          });
        }),
      );
  }

  /** 流结束后写入 assistant 消息并触发后续异步任务 */
  private async persistAssistantReply(options: {
    conversationId: number;
    messageContent: string;
    finalContent: string;
    thinking: string;
    fromCache: boolean;
    promptTokens?: number;
    completionTokens?: number;
    isFirstAiReply: boolean;
  }): Promise<void> {
    const {
      conversationId,
      messageContent,
      finalContent,
      thinking,
      fromCache,
      promptTokens,
      completionTokens,
      isFirstAiReply,
    } = options;

    try {
      await this.conversationService.createAssistantMessage(conversationId, {
        content: finalContent,
        thinking: thinking || undefined,
        fromCache,
        promptTokens: fromCache ? 0 : promptTokens,
        completionTokens: fromCache ? 0 : completionTokens,
      });
      await this.conversationService.touchUpdatedAt(conversationId);

      // 首条 AI 回复后异步优化标题
      if (isFirstAiReply && finalContent && !finalContent.endsWith('[回复中断]')) {
        setImmediate(() => {
          void this.titleService.refineTitle(
            conversationId,
            messageContent,
            finalContent,
          );
        });
      }

      // 异步增量摘要
      this.summaryService.scheduleSummaryUpdate(conversationId);
    } catch {
      // 持久化失败不影响已结束的 SSE 流
    }
  }

  /** 将流式异常转为 SSE error 事件，避免前端只看到「连接中断」 */
  private extractStreamErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      if (typeof body === 'string') return body;
      if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join('，');
        if (typeof message === 'string' && message.trim()) return message;
      }
      return err.message;
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return 'AI 服务异常，请稍后重试';
  }

  private parseStreamPayload(data: unknown): StreamPayload {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as StreamPayload;
      } catch {
        return { response: data };
      }
    }

    if (data && typeof data === 'object') {
      return data as StreamPayload;
    }

    return {};
  }
}
