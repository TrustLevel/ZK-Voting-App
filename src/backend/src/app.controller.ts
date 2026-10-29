import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { isCardanoNetwork } from './network/network-config';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('current-slot')
  async getCurrentSlot(@Query('network') network?: string) {
    const currentSlot = await this.appService.getCurrentSlot(isCardanoNetwork(network) ? network : 'preprod');
    return { currentSlot };
  }
}
