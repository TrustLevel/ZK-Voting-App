import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DataSignature } from '../types/cardano.types';

const mockUsersService = () => ({
  findUserByWallet: jest.fn(),
  hasUserUsedNonce: jest.fn(),
  addNonceToUser: jest.fn(),
  getLastNonceForUser: jest.fn(),
  findOrCreateUserByWallet: jest.fn(),
});

const mockJwtService = () => ({
  signAsync: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let usersService: ReturnType<typeof mockUsersService>;

  beforeEach(async () => {
    usersService = mockUsersService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: mockJwtService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('verifyCardanoSignature', () => {
    const address = 'addr_test1abc';
    const sig: DataSignature = { signature: 'sig', key: 'key' };

    it('throws BadRequestException when no nonce exists for the address', async () => {
      usersService.getLastNonceForUser.mockResolvedValue(null);

      await expect(service.verifyCardanoSignature(address, 'any-nonce', sig))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when provided nonce does not match stored nonce', async () => {
      usersService.getLastNonceForUser.mockResolvedValue('stored-nonce');

      await expect(service.verifyCardanoSignature(address, 'different-nonce', sig))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('generateCardanoNonce', () => {
    it('returns a nonce without persisting it for a new (unknown) address', async () => {
      usersService.findUserByWallet.mockResolvedValue(null);

      const result = await service.generateCardanoNonce('addr_test1new');

      expect(result).toHaveProperty('nonce');
      expect(typeof result.nonce).toBe('string');
      expect(usersService.addNonceToUser).not.toHaveBeenCalled();
    });

    it('generates and persists a nonce for an existing user', async () => {
      usersService.findUserByWallet.mockResolvedValue({ userId: 1 });
      usersService.hasUserUsedNonce.mockResolvedValue(false);
      usersService.addNonceToUser.mockResolvedValue(undefined);

      const result = await service.generateCardanoNonce('addr_test1existing');

      expect(result).toHaveProperty('nonce');
      expect(usersService.addNonceToUser).toHaveBeenCalledTimes(1);
    });
  });
});
