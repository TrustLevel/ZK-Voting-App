import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('cardano/nonce')
  async generateCardanoNonce(@Body('walletAddress') walletAddress: string) {
    return await this.authService.generateCardanoNonce(walletAddress);
  }

  @Post('cardano/verify')
  async verifyCardanoSignature(
    @Body('walletAddress') walletAddress: string,
    @Body('nonce') nonce: string,
    @Body('signature') signature: any,
  ) {
    return await this.authService.verifyCardanoSignature(walletAddress, nonce, signature);
  }
}
