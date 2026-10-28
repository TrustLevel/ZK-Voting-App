jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { VotingEventService } from './voting-event.service';

const contextFor = (params: Record<string, string>, headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ params, headers }) }),
  }) as unknown as ExecutionContext;

describe('AdminTokenGuard', () => {
  const validateAdminToken = jest.fn();
  const guard = new AdminTokenGuard({ validateAdminToken } as unknown as VotingEventService);

  beforeEach(() => validateAdminToken.mockReset());

  it('lets the request through with the event admin token', async () => {
    validateAdminToken.mockResolvedValue({ valid: true });
    await expect(guard.canActivate(contextFor({ eventId: '7' }, { 'x-admin-token': 'tok' }))).resolves.toBe(true);
    expect(validateAdminToken).toHaveBeenCalledWith(7, 'tok');
  });

  it('rejects a request without the header', async () => {
    await expect(guard.canActivate(contextFor({ eventId: '7' }, {}))).rejects.toThrow(UnauthorizedException);
    expect(validateAdminToken).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    validateAdminToken.mockResolvedValue({ valid: false, error: 'Invalid admin token' });
    await expect(guard.canActivate(contextFor({ eventId: '7' }, { 'x-admin-token': 'nope' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
