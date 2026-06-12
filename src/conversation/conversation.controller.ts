import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { Observable, defer, finalize, from, switchMap, tap } from 'rxjs';
import { AiService } from '../ai/ai.service';
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
    @Req() req: Request & { user: JwtPayload },
  ): Observable<MessageEvent> {
    if (!content?.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const conversationId = +id;
    const userId = req.user.userId;
    const trimmedContent = content.trim();

    return defer(() =>
      from(this.prepareStream(conversationId, userId, trimmedContent)),
    ).pipe(switchMap((obs) => obs));
  }

  /** 流式发送编排：写消息 → 组装上下文 → 流式回复 → 持久化 */
  private async prepareStream(
    conversationId: number,
    userId: number,
    content: string,
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

    await this.conversationService.createUserMessage(conversationId, content);

    // 首条用户消息 → 截断更新标题
    if (userCountBefore === 0) {
      await this.conversationService.updateTitleDirect(
        conversationId,
        this.titleService.truncateTitle(content),
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

    const ollamaMessages = this.contextBuilder.build(conversation, messages);
    const isFirstAiReply = assistantCountBefore === 0;

    let thinking = '';
    let response = '';
    let fromCache = false;
    let finishedNormally = false;

    return this.aiService
      .streamChat(ollamaMessages, conversation.summary)
      .pipe(
        tap((event) => {
          const payload = this.parseStreamPayload(event.data);
          if (payload.thinking) thinking = payload.thinking;
          if (payload.response) response = payload.response;
          if (payload.fromCache) fromCache = true;
        }),
        tap({
          complete: () => {
            finishedNormally = true;
          },
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
            content,
            finalContent,
            thinking,
            fromCache,
            isFirstAiReply,
          });
        }),
      );
  }

  /** 流结束后写入 assistant 消息并触发后续异步任务 */
  private async persistAssistantReply(options: {
    conversationId: number;
    content: string;
    finalContent: string;
    thinking: string;
    fromCache: boolean;
    isFirstAiReply: boolean;
  }): Promise<void> {
    const {
      conversationId,
      content,
      finalContent,
      thinking,
      fromCache,
      isFirstAiReply,
    } = options;

    try {
      await this.conversationService.createAssistantMessage(conversationId, {
        content: finalContent,
        thinking: thinking || undefined,
        fromCache,
      });
      await this.conversationService.touchUpdatedAt(conversationId);

      // 首条 AI 回复后异步优化标题
      if (isFirstAiReply && finalContent && !finalContent.endsWith('[回复中断]')) {
        setImmediate(() => {
          void this.titleService.refineTitle(
            conversationId,
            content,
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
