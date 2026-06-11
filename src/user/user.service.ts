import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private omitPassword(user: User) {
    const { password, ...rest } = user;
    return rest;
  }

  async create(createUserDto: CreateUserDto) {
    const existUser = await this.prisma.user.findUnique({
      where: { username: createUserDto.username },
    });
    if (existUser) {
      throw new ConflictException('用户已存在');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: createUserDto.username,
        password: hashedPassword,
      },
    });
    return this.omitPassword(user);
  }

  findAll() {
    return this.prisma.user
      .findMany({ orderBy: { id: 'asc' } })
      .then((users) => users.map((user) => this.omitPassword(user)));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return this.omitPassword(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (updateUserDto.username) {
      const existUser = await this.prisma.user.findUnique({
        where: { username: updateUserDto.username },
      });
      if (existUser && existUser.id !== id) {
        throw new ConflictException('用户名已存在');
      }
    }

    const data: { username?: string; password?: string } = {};
    if (updateUserDto.username) {
      data.username = updateUserDto.username;
    }
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });
    return this.omitPassword(updated);
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: '删除成功' };
  }
}
