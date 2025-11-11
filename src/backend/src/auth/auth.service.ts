import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { generateNonce, checkSignature, DataSignature } from '@meshsdk/core';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

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

  async verifyCardanoSignature(
    userAddress: string,
    nonce: string,
    signature: DataSignature,
  ) {
    this.logger.log(`Verifying Cardano signature for address: ${userAddress.substring(0, 8)}...`);

    // Get the last generated nonce for this user
    const lastNonce = await this.usersService.getLastNonceForUser(userAddress);
    
    if (!lastNonce) {
      this.logger.warn(`No nonces found for address: ${userAddress.substring(0, 8)}...`);
      throw new BadRequestException('No nonce found for this address');
    }

    // Check if the provided nonce matches the last generated nonce
    if (nonce !== lastNonce) {
      this.logger.warn(`Nonce mismatch for address: ${userAddress.substring(0, 8)}...`);
      throw new BadRequestException('Invalid nonce - must use the last generated nonce');
    }

    this.logger.debug(`Using last nonce for verification: ${nonce.substring(0, 8)}...`);

    // Verify the signature using Mesh SDK
    const isValidSignature = await checkSignature(nonce, signature, userAddress);

    this.logger.debug(`Signature verification result: ${isValidSignature}`);

    if (!isValidSignature) {
      this.logger.warn(`Invalid signature for address: ${userAddress.substring(0, 8)}...`);
      throw new BadRequestException('Invalid signature provided');
    }

    // Signature is valid, create or find user
    let finalUser = await this.usersService.findOrCreateUserByWallet(userAddress);

    // Generate JWT token
    const jwt = await this.jwtService.signAsync({ user: finalUser });

    this.logger.log(
      `Cardano authentication successful for address: ${userAddress.substring(0, 8)}...`,
    );
    
    return { user: finalUser, jwt };
  }
}
