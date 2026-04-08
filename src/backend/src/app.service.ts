import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockfrostProvider } from '@meshsdk/core';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getCurrentSlot(): Promise<number> {
    const apiKey = this.configService.get<string>('BLOCKFROST_API_KEY') ?? '';
    const provider = new BlockfrostProvider(apiKey);
    const block = await provider.fetchLatestBlock();
    return parseInt(block.slot);
  }
}
