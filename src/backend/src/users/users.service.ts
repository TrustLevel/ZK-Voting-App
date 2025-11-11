import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findOrCreateUserByEmail(email: string): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { userEmail: email },
    });

    if (!user) {
      user = this.userRepository.create({
        userEmail: email,
        eventPermissions: '[]',
        nonces: '[]',
      });
      await this.userRepository.save(user);
    }

    return user;
  }

  async findOrCreateUserByWallet(walletAddress: string): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { walletAddress },
    });

    if (!user) {
      user = this.userRepository.create({
        walletAddress,
        eventPermissions: '[]',
        nonces: '[]',
      });
      await this.userRepository.save(user);
    }

    return user;
  }
}
