import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Document, KnowledgeBase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseVisibility } from './constants';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

export interface JwtUser {
  userId: number;
  role: string;
}

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOwnerOrAdmin(
    knowledgeBase: Pick<KnowledgeBase, 'userId'>,
    currentUser: JwtUser,
  ) {
    if (currentUser.role === 'admin') return;
    if (knowledgeBase.userId !== currentUser.userId) {
      throw new ForbiddenException('仅知识库拥有者可执行该操作');
    }
  }

  canAccess(
    knowledgeBase: Pick<KnowledgeBase, 'userId' | 'visibility'>,
    currentUser: JwtUser,
    ownerRole: string,
  ): boolean {
    if (currentUser.role === 'admin') return true;
    if (knowledgeBase.userId === currentUser.userId) return true;
    if (knowledgeBase.visibility === 'public') return true;
    if (knowledgeBase.visibility === 'team') {
      return ownerRole === currentUser.role;
    }
    return false;
  }

  async findAccessible(
    currentUser: JwtUser,
    knowledgeBaseIds?: number[],
  ): Promise<KnowledgeBase[]> {
    const idFilter =
      knowledgeBaseIds && knowledgeBaseIds.length > 0
        ? { id: { in: knowledgeBaseIds } }
        : {};

    if (currentUser.role === 'admin') {
      return this.prisma.knowledgeBase.findMany({
        where: idFilter,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const sameRoleUsers = await this.prisma.user.findMany({
      where: { role: currentUser.role },
      select: { id: true },
    });
    const sameRoleUserIds = sameRoleUsers.map((user) => user.id);

    return this.prisma.knowledgeBase.findMany({
      where: {
        ...idFilter,
        OR: [
          { userId: currentUser.userId },
          { visibility: 'public' },
          {
            visibility: 'team',
            userId: { in: sameRoleUserIds },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(dto: CreateKnowledgeBaseDto, currentUser: JwtUser): Promise<KnowledgeBase> {
    return this.prisma.knowledgeBase.create({
      data: {
        userId: currentUser.userId,
        name: dto.name,
        description: dto.description,
        visibility: (dto.visibility ?? 'private') as KnowledgeBaseVisibility,
      },
    });
  }

  async update(
    id: number,
    dto: UpdateKnowledgeBaseDto,
    currentUser: JwtUser,
  ): Promise<KnowledgeBase> {
    const kb = await this.findOneOrFail(id, currentUser);
    this.assertOwnerOrAdmin(kb, currentUser);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      },
    });
  }

  async remove(id: number, currentUser: JwtUser): Promise<KnowledgeBase> {
    const kb = await this.findOneOrFail(id, currentUser);
    this.assertOwnerOrAdmin(kb, currentUser);
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }

  async listDocuments(kbId: number, currentUser: JwtUser): Promise<Document[]> {
    await this.findOneOrFail(kbId, currentUser);
    return this.prisma.document.findMany({
      where: { knowledgeBaseId: kbId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDocument(
    kbId: number,
    currentUser: JwtUser,
    input: { filename: string; mimeType: string; filePath: string },
  ): Promise<Document> {
    const kb = await this.findOneOrFail(kbId, currentUser);
    this.assertOwnerOrAdmin(kb, currentUser);

    return this.prisma.document.create({
      data: {
        knowledgeBaseId: kbId,
        filename: input.filename,
        mimeType: input.mimeType,
        filePath: input.filePath,
      },
    });
  }

  async removeDocument(
    kbId: number,
    documentId: number,
    currentUser: JwtUser,
  ): Promise<Document> {
    await this.assertDocumentBelongsToKb(kbId, documentId, currentUser);

    return this.prisma.document.delete({
      where: { id: documentId },
    });
  }

  async assertDocumentBelongsToKb(
    kbId: number,
    documentId: number,
    currentUser: JwtUser,
  ): Promise<Document> {
    const kb = await this.findOneOrFail(kbId, currentUser);
    this.assertOwnerOrAdmin(kb, currentUser);

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document || document.knowledgeBaseId !== kbId) {
      throw new BadRequestException('文档不存在或不属于当前知识库');
    }

    return document;
  }

  async findOneOrFail(id: number, currentUser: JwtUser): Promise<KnowledgeBase> {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
    });

    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: kb.userId },
      select: { role: true },
    });

    const ownerRole = owner?.role ?? '';
    if (!this.canAccess(kb, currentUser, ownerRole)) {
      throw new ForbiddenException('无权访问该知识库');
    }

    return kb;
  }
}
