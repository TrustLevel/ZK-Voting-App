import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The organiser endpoints receive the wallet's UTxO list (build-*-tx); a wallet with many
  // token UTxOs exceeds Express' 100 kB default.
  app.useBodyParser('json', { limit: '1mb' });

  const configService = app.get<ConfigService>(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
}

void bootstrap();
