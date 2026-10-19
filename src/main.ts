import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:5177', 'http://127.0.0.1:5177'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT') ?? 3001);
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
void bootstrap();
