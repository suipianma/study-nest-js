import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,  //自动过滤没定义的字段
    forbidNonWhitelisted: true,  //如果定义了没定义的字段，则抛出异常
    transform: true,  //自动转换类型
  }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
