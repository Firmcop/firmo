import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/problem.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => { req.requestId = req.headers['x-request-id'] || randomUUID(); res.setHeader('x-request-id', req.requestId); next(); });
  app.enableCors({ origin: process.env.PUBLIC_WEB_ORIGIN?.split(',') ?? false, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('FirmPlant API').setVersion('0.1.0').addCookieAuth('fp_session').build());
  SwaggerModule.setup('api/docs', app, doc);

  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();
