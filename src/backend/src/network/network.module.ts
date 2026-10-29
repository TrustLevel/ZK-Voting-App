import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NetworkConfig } from './network-config';

@Module({
  imports: [ConfigModule],
  providers: [NetworkConfig],
  exports: [NetworkConfig],
})
export class NetworkModule {}
