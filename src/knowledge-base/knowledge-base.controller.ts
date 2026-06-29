import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { decodeMulterOriginalName } from '../common/utils/multer-filename.util';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { QdrantService } from '../vector/qdrant.service';
import { RAG_MAX_FILE_MB } from './constants';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { DeleteDocumentDto } from './dto/delete-document.dto';
import { SearchKnowledgeBaseDto } from './dto/search-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { IngestService } from './ingest.service';
import { JwtUser, KnowledgeBaseService } from './knowledge-base.service';
import { RetrievalService } from './retrieval.service';
import { IngestQueueService } from './ingest-queue.service';

@Controller('knowledge-bases')
@ApiTags('知识库模块')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@SkipThrottle()
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly ingestService: IngestService,
    private readonly retrievalService: RetrievalService,
    private readonly qdrantService: QdrantService,
    private readonly ingestQueueService: IngestQueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取可访问知识库列表' })
  findAll(@Req() req: Request & { user: JwtUser }) {
    return this.knowledgeBaseService.findAccessible(req.user);
  }

  @Post()
  @ApiOperation({ summary: '创建知识库' })
  create(
    @Body() dto: CreateKnowledgeBaseDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.knowledgeBaseService.create(dto, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取知识库详情' })
  findOne(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.knowledgeBaseService.findOneOrFail(+id, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新知识库' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.knowledgeBaseService.update(+id, dto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除知识库' })
  async remove(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    await this.qdrantService.deleteByKnowledgeBaseId(+id);
    return this.knowledgeBaseService.remove(+id, req.user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: '获取知识库文档列表' })
  findDocuments(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.knowledgeBaseService.listDocuments(+id, req.user);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: '上传知识库文档' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: RAG_MAX_FILE_MB * 1024 * 1024 },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const kbId = String(req.params.id ?? '');
          const targetDir = join(process.cwd(), 'uploads', 'kb', kbId);
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
          cb(null, targetDir);
        },
        filename: (req, file, cb) => {
          const originalName = decodeMulterOriginalName(file.originalname);
          const extension = extname(originalName);
          const baseName = originalName.replace(extension, '');
          cb(null, `${Date.now()}-${baseName}${extension}`);
        },
      }),
    }),
  )
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    const document = await this.knowledgeBaseService.createDocument(+id, req.user, {
      filename: decodeMulterOriginalName(file.originalname),
      mimeType: file.mimetype,
      filePath: file.path,
    });

    // 异步入库：Bull 队列持久化，进程重启不丢任务
    await this.ingestQueueService.enqueue(document.id);

    return document;
  }

  @Delete(':id/documents')
  @ApiOperation({ summary: '删除知识库文档' })
  async removeDocument(
    @Param('id') id: string,
    @Body() dto: DeleteDocumentDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    await this.ingestService.deleteDocumentVectors(dto.documentId);
    return this.knowledgeBaseService.removeDocument(+id, dto.documentId, req.user);
  }

  @Post(':id/documents/:docId/reindex')
  @ApiOperation({ summary: '重新索引文档（切片策略更新后使用）' })
  async reindexDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    await this.knowledgeBaseService.assertDocumentBelongsToKb(
      +id,
      +docId,
      req.user,
    );

    await this.ingestQueueService.enqueue(+docId);

    return { success: true };
  }

  @Post(':id/search')
  @ApiOperation({ summary: '知识库检索' })
  async search(
    @Param('id') id: string,
    @Body() dto: SearchKnowledgeBaseDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    const chunks = await this.retrievalService.search(dto.query, [+id], req.user);
    return {
      chunks,
      citations: this.retrievalService.toCitations(chunks),
    };
  }
}
