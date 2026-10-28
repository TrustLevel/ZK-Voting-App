import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { VotingEventService } from './voting-event.service';

// Protects admin-only event endpoints. The manage page holds the event's adminToken
// (from the admin link) and sends it in the `x-admin-token` header.
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly votingEventService: VotingEventService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const eventId = Number(request.params?.eventId);
    const token = request.headers?.['x-admin-token'];

    if (!Number.isInteger(eventId) || typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Admin token required');
    }

    const validation = await this.votingEventService.validateAdminToken(eventId, token);
    if (!validation.valid) {
      throw new UnauthorizedException(validation.error ?? 'Invalid admin token');
    }
    return true;
  }
}
