import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VotingEventModule } from './voting-event/voting-event.module';

@Module({
  imports: [AuthModule, UsersModule, VotingEventModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
