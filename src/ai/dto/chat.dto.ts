import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty({ message: 'prompt 不能为空' })
  @MaxLength(4000, { message: 'prompt 过长' })
  prompt: string;
}
