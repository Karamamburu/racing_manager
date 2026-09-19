import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './http/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(process.env.PORT ?? 6000);
}

void bootstrap();
