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
import { Observable, defer, from, switchMap } from 'rxjs';
import { AiOrchestratorService } from '../ai/orchestrator/ai-orchestrator.service';
import { parseKnowledgeBaseIds } from '../ai/orchestrator/utils/parse-knowledge-base-ids.util';
import { ContextTraceStoreService } from '../context-engine/context-trace-store.service';
import { ConversationStreamService } from './conversation-stream.service';
import { ConversationService } from './conversation.service';
import { StreamSessionService } from './stream-session.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtQueryGuard } from './guards/jwt-query.guard';
import {
  JwtUnlessUserGuard,
  StreamTicketGuard,
} from './guards/stream-ticket.guard';
import { StreamTicketService } from './stream-ticket.service';

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
    private readonly aiOrchestrator: AiOrchestratorService,
    private readonly contextTraceStore: ContextTraceStoreService,
    private readonly streamTicketService: StreamTicketService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取会话列表（支持搜索）' })
  findAll(
    @Query('q') q: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.findAllByUser(req.user.userId, q);
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

  @Patch(':id/pin')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '置顶/取消置顶会话' })
  setPinned(
    @Param('id') id: string,
    @Body() body: { pinned: boolean },
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.setPinned(+id, req.user.userId, !!body.pinned);
  }

  @Get(':id/export')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '导出会话消息 JSON' })
  exportConversation(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.exportConversation(+id, req.user.userId);
  }

  @Patch(':id/messages/:messageId/feedback')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '设置助手消息反馈' })
  setMessageFeedback(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: { feedback: 'up' | 'down' | null },
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.conversationService.setMessageFeedback(
      +id,
      req.user.userId,
      +messageId,
      body.feedback ?? null,
    );
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

  @Get(':id/traces/:requestId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取单次请求的 Context Engine Trace' })
  getContextTrace(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.contextTraceStore.get(+id, req.user.userId, requestId);
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

  @Post(':id/stream/ticket')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '申请 SSE 一次性 stream ticket（替代 URL token）' })
  async createStreamTicket(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.conversationService.findOneOrFail(+id, req.user.userId);
    return this.streamTicketService.createTicket(+id, req.user.userId);
  }

  @Sse(':id/stream')
  @SkipThrottle()
  @UseGuards(StreamTicketGuard, JwtQueryGuard, JwtUnlessUserGuard)
  @ApiOperation({ summary: '流式发送消息并获取 AI 回复（支持 streamId 续传）' })
  stream(
    @Param('id') id: string,
    @Query('content') content: string | undefined,
    @Query('streamId') streamId: string | undefined,
    @Query('promptId') promptId: string | undefined,
    @Query('knowledgeBaseIds') knowledgeBaseIdsRaw: string | string[] | undefined,
    @Query('regenerate') regenerateRaw: string | undefined,
    @Query('model') model: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ): Observable<MessageEvent> {
    const conversationId = +id;
    const userId = req.user.userId;
    const resumeStreamId = streamId?.trim();

    if (resumeStreamId) {
      return defer(() =>
        from(this.attachStream(conversationId, userId, resumeStreamId)),
      ).pipe(switchMap((obs) => obs));
    }

    if (!content?.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const knowledgeBaseIds = parseKnowledgeBaseIds(knowledgeBaseIdsRaw);
    const isRegenerate = regenerateRaw === '1' || regenerateRaw === 'true';

    return defer(() =>
      from(
        this.aiOrchestrator.run({
          conversationId,
          userId,
          role: req.user.role,
          content: content.trim(),
          promptId,
          knowledgeBaseIds,
          isRegenerate,
          model: model?.trim() || undefined,
        }),
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
    return this.aiOrchestrator.resume(conversationId, userId, streamId);
  }
}
