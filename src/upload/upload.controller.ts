import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { decodeMulterOriginalName } from '../common/utils/multer-filename.util';

@Controller('upload')
@ApiTags('上传模块')
export class UploadController {
  constructor(private readonly configService: ConfigService) {}

  @Post()
  @ApiOperation({ summary: '上传文件' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const originalname = decodeMulterOriginalName(file.originalname);
        cb(null, `${Date.now()}-${originalname}`);
      },
    }),
  }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return {
      url: `${this.configService.getOrThrow<string>('APP_URL')}/uploads/${encodeURIComponent(file.filename)}`,
    };
  }
}
