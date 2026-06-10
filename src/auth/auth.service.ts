import { Injectable, BadGatewayException, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RedisService } from 'src/redis/redis.service';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';



@Injectable()
export class AuthService {
  // 同一 IP 登录失败上限与锁定时长（秒）
  private readonly LOGIN_FAIL_MAX = 5;
  private readonly LOGIN_FAIL_TTL = 15 * 60;
 
  constructor(
    private readonly prisma: PrismaService, 
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger
  ) {}

  // 检查 IP 是否已被锁定
  private async checkIpLoginLimit(ip: string) {
    this.logger.info(`检查 IP 是否已被锁定: ${ip}`);
    const isLocked = await this.redisService.redis.get(`login:lock:${ip}`);
    if (isLocked) {
      throw new HttpException('登录尝试次数过多，请15分钟后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // 记录登录失败，达到上限则锁定 IP
  private async recordLoginFailure(ip: string) {
    const failKey = `login:fail:${ip}`;
    const count = await this.redisService.redis.incr(failKey);
    if (count === 1) {
      await this.redisService.redis.expire(failKey, this.LOGIN_FAIL_TTL);
    }
    if (count >= this.LOGIN_FAIL_MAX) {
      await this.redisService.redis.set(`login:lock:${ip}`, '1', 'EX', this.LOGIN_FAIL_TTL);
    }
  }

  // 登录成功后清除 IP 失败记录
  private async clearLoginFailure(ip: string) {
    await this.redisService.redis.del(`login:fail:${ip}`, `login:lock:${ip}`);
  }

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
  async login(body: LoginDto, ip: string) {
    const { username, password } = body;

    // IP 登录限制：失败次数过多则拒绝
    await this.checkIpLoginLimit(ip);

    // 查询用户
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      await this.recordLoginFailure(ip);
      throw new BadGatewayException('用户不存在');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.recordLoginFailure(ip);
      throw new BadGatewayException('密码错误');
    }

    // 登录成功，清除该 IP 的失败记录
    await this.clearLoginFailure(ip);

    // 生成 token
    const accessToken = this.jwtService.sign( { userId: user.id, username: user.username, role: user.role  }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as any });
    const refreshToken = this.jwtService.sign({ userId: user.id, username: user.username, role: user.role  }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any });

    await this.redisService.redis.set(
      `refreshToken:${user.id}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60,
    );

    // 记录用户最近一次登录 IP
    await this.redisService.redis.set(
      `login:ip:${user.id}`,
      ip,
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
