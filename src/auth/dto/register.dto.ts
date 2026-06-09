import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto{
  @IsNotEmpty({message: '用户名不能为空', })
  @IsString({message: '用户名必须为字符串',})
  @MinLength(3, {message: '用户名长度不能小于3'})
  @MaxLength(20, {message: '用户名长度不能大于20'})
  @ApiProperty({ description: '用户名', example: 'admin' })
  username: string;

  @IsNotEmpty({message: '密码不能为空',})
  @IsString({message: '密码必须为字符串',})
  @MinLength(6, {message: '密码长度不能小于6'})
  @MaxLength(20, {message: '密码长度不能大于20'})
  @ApiProperty({ description: '密码', example: '123456' })
  password: string;
}