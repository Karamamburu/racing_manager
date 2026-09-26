import './tz';
import 'dotenv/config';
import session from 'express-session';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '2mb' });

  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.SESSION_COOKIE_SECURE === 'true' ||
          process.env.NODE_ENV === 'production',
      },
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
