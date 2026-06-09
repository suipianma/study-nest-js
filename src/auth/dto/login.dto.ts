import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @IsString()
  @ApiProperty({ description: '用户名', example: 'admin' })
  username: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({ description: '密码', example: '123456' })
  password: string;
}
