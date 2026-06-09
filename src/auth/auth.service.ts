import { Injectable, BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async register(body: any) {
    const { username, password } = body;

    // 查询用户
    const existUser = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existUser) {
      throw new BadGatewayException('用户已存在');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await this.prisma.user.create({
      data: { username, password: hashedPassword },
    });
    return user;
  }

  async login(body: any) {
    const { username, password } = body;

    // 查询用户
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw new BadGatewayException('用户不存在');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadGatewayException('密码错误');
    }

    // 生成 token
    const token = this.jwtService.sign({ userId: user.id });

    return {
      username: user.username,
      accessToken: token,
    };
  }
}
