import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('cardano/nonce')
  async generateCardanoNonce(@Body('walletAddress') walletAddress: string) {
    return await this.authService.generateCardanoNonce(walletAddress);
  }
}
