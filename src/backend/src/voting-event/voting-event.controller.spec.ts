jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { VotingEventController } from './voting-event.controller';
import { AdminTokenGuard } from './admin-token.guard';

// Collects every route of the controller as "METHOD path" → handler name.
const routes = () => {
  const proto = VotingEventController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined)
    .map((name) => {
      const handler = proto[name] as object;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      return { route: `${method} ${Reflect.getMetadata(PATH_METADATA, handler)}`, guarded: guards.includes(AdminTokenGuard) };
    });
};

describe('VotingEventController routes', () => {
  const adminRoutes = [
    'PATCH :eventId',
    'DELETE :eventId/participants/:userId',
    'POST :eventId/invite',
    'GET :eventId/invited',
    'POST :eventId/send-invitations',
    'POST :eventId/mark-invitations-sent',
    'DELETE :eventId/nullifier',
    'POST :eventId/save-blockchain-data',
    'POST :eventId/confirm-group-update',
    'POST :eventId/build-update-group-tx',
    'GET :eventId/fee-deposit',
    'POST :eventId/confirm-fee-deposit',
  ];

  it.each(adminRoutes)('%s requires the admin token', (route) => {
    const found = routes().find((r) => r.route === route);
    expect(found).toBeDefined();
    expect(found!.guarded).toBe(true);
  });

  it('only the admin routes are guarded', () => {
    const guarded = routes().filter((r) => r.guarded).map((r) => r.route).sort();
    expect(guarded).toEqual([...adminRoutes].sort());
  });

  it('declares GET networks before GET :eventId so it is not read as an event id', () => {
    const all = routes().map((r) => r.route);
    expect(all.indexOf('GET networks')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('GET networks')).toBeLessThan(all.indexOf('GET :eventId'));
  });

  it('has no public endpoint that writes nullifiers or submits arbitrary txs (F2)', () => {
    const all = routes().map((r) => r.route);
    expect(all).not.toContain('POST :eventId/nullifier');
    expect(all).not.toContain('POST :eventId/vote');
  });
});
