import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('users')
@ApiTags('用户模块')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建用户' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
  
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有用户' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取单个用户' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除用户' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
