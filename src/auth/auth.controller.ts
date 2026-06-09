import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
@ApiTags('认证模块')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: '注册' })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '登录' })
  @Post('login')
  login(@Body() body: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
    return this.authService.login(body, ip);
  }

  @ApiOperation({ summary: '刷新token' })
  @Post('refresh')
  refresh(@Body() body: {refreshToken: string}) {
    return this.authService.refresh(body.refreshToken);
  }

  @ApiOperation({ summary: '退出登录' })
  @Post('logout')
  logout(@Body() body: {userId: number}) {
    return this.authService.logout(body.userId);
  }
}
