import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('find-or-create-by-wallet')
  async findOrCreateUserByWallet(@Body('walletAddress') walletAddress: string) {
    return await this.usersService.findOrCreateUserByWallet(walletAddress);
  }

  @Post('find-or-create-by-email')
  async findOrCreateUserByEmail(@Body('email') email: string) {
    return await this.usersService.findOrCreateUserByEmail(email);
  }

  @Get(':userId')
  async getUserById(@Param('userId') userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}
