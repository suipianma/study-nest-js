import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        // 控制台输出
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ level, message, timestamp }) => {
              return `${timestamp} ${level}: ${message}`;
            }),
          ),
        }),
        // 错误日志
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        // 所有日志
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
