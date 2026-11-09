import { canManageUser } from './admin-rules';

const u = (id: string, role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN') => ({ id, role });

describe('canManageUser', () => {
  it('nobody can change themselves', () => {
    expect(canManageUser(u('a', 'SUPER_ADMIN'), u('a', 'SUPER_ADMIN'), 'USER').ok).toBe(false);
  });
  it('moderators cannot manage users at all', () => {
    expect(canManageUser(u('m', 'MODERATOR'), u('x', 'USER')).ok).toBe(false);
  });
  it('admins manage users and moderators but cannot grant ADMIN', () => {
    expect(canManageUser(u('a', 'ADMIN'), u('x', 'USER'), 'MODERATOR').ok).toBe(true);
    expect(canManageUser(u('a', 'ADMIN'), u('x', 'MODERATOR')).ok).toBe(true);
    expect(canManageUser(u('a', 'ADMIN'), u('x', 'USER'), 'ADMIN').ok).toBe(false);
    expect(canManageUser(u('a', 'ADMIN'), u('x', 'ADMIN')).ok).toBe(false);
    expect(canManageUser(u('a', 'ADMIN'), u('x', 'SUPER_ADMIN')).ok).toBe(false);
  });
  it('super admins can manage anyone else', () => {
    expect(canManageUser(u('s', 'SUPER_ADMIN'), u('x', 'ADMIN'), 'SUPER_ADMIN').ok).toBe(true);
  });
});
