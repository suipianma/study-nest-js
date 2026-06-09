import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('auth')
@ApiTags('认证模块')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: '注册' })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @ApiOperation({ summary: '登录' })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @ApiOperation({ summary: '刷新token' })
  @Post('refresh')
  refresh(@Body() body: {refreshToken: string}) {
    return this.authService.refresh(body.refreshToken);
  }
}
