import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { generateNonce } from '@meshsdk/core';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly usersService: UsersService) {}

  async generateCardanoNonce(userAddress: string) {
    this.logger.log(`Generating Cardano nonce for address: ${userAddress.substring(0, 8)}...`);

    // Check if user exists, if not we can generate any nonce
    const userExists = await this.usersService.findUserByWallet(userAddress);

    if (!userExists) {
      // User doesn't exist yet, generate nonce and return
      const nonce = generateNonce('Sign to prove wallet ownership: ');
      this.logger.debug(`Generated nonce for new user: ${userAddress.substring(0, 8)}...`);
      return { nonce };
    }

    // User exists, check for used nonces
    let nonce = generateNonce('Sign to prove wallet ownership: ');

    // Keep generating new nonces while current one is already used
    while (await this.usersService.hasUserUsedNonce(userAddress, nonce)) {
      nonce = generateNonce('Sign to prove wallet ownership: ');
    }

    // Add the new unique nonce to the user's record
    await this.usersService.addNonceToUser(userAddress, nonce);

    this.logger.debug(`Generated and stored unique nonce for address: ${userAddress.substring(0, 8)}...`);

    return { nonce };
  }
}
