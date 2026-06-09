import { Injectable, BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, 
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService
  ) {}

  // 注册
  async register(body: RegisterDto) {
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
      data: { username, password: hashedPassword, role: 'user'},
    });
    return user;
  }

  // 登录
  async login(body: LoginDto) {
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
    // const token = this.jwtService.sign({ userId: user.id, username: user.username, role: user.role  });
    const accessToken = this.jwtService.sign( { userId: user.id, username: user.username, role: user.role  }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as any });
    const refreshToken = this.jwtService.sign({ userId: user.id, username: user.username, role: user.role  }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any });

    await this.redisService.redis.set(
      `refreshToken:${user.id}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60,
    );

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  // 刷新 token
  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      // verify 返回的 payload 含 iat/exp，不能直接用于 sign，否则会报错
      const { iat, exp, ...userPayload } = payload as { iat?: number; exp?: number; userId: number; username: string; role: string };

      // 校验 Redis 中存储的 refreshToken 是否与传入的一致
      const storedToken = await this.redisService.redis.get(`refreshToken:${userPayload.userId}`);
      if (!storedToken || storedToken !== refreshToken) {
        throw new BadGatewayException('refreshToken 无效');
      }

      const accessToken = this.jwtService.sign(userPayload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as any });
      return {
        accessToken: accessToken,
      };
    } catch (error) {
      throw new BadGatewayException('refreshToken 无效');
    }
  }

  // 退出登录
  async logout(userId: number) {
    await this.redisService.redis.del(`refreshToken:${userId}`);
    return {
      message: '退出登录成功',
    };
  }
}
