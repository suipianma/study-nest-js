import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

//PartialType(CreateUserDto) 继承 CreateUserDto 的所有字段，并把字段变成可选
export class UpdateUserDto extends PartialType(CreateUserDto) {}
