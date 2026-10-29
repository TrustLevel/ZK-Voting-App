import { Injectable } from '@nestjs/common';
import { BlockfrostProvider } from '@meshsdk/core';
import { CardanoNetwork, NetworkConfig } from './network/network-config';

@Injectable()
export class AppService {
  constructor(private readonly networkConfig: NetworkConfig) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getCurrentSlot(network: CardanoNetwork = 'preprod'): Promise<number> {
    const apiKey = this.networkConfig.blockfrostApiKey(network) ?? '';
    const provider = new BlockfrostProvider(apiKey);
    const block = await provider.fetchLatestBlock();
    return parseInt(block.slot);
  }
}
