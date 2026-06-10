import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor } from './common/interceptors/response.interceptors';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局管道 验证请求参数
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,  //自动过滤没定义的字段
    forbidNonWhitelisted: true,  //如果定义了没定义的字段，则抛出异常
    transform: true,  //自动转换类型
  }));

  // 全局拦截器 统一响应格式
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常过滤器 统一异常处理
  app.useGlobalFilters(new HttpExceptionFilter());

  // 设置swagger文档 方便前端开发人员查看接口文档(自动生成接口文档)
  const config = new DocumentBuilder()
    .setTitle('AI Admin API')
    .setDescription('AI 后台管理系统接口文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
