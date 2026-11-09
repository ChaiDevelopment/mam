import { ROLE_RANK, type Role } from '@mam/shared-types';

/**
 * Who may change whom. Enforced server-side for every admin user mutation.
 *  - Nobody may change their own role or status (prevents lock-out and self-escalation).
 *  - SUPER_ADMIN may manage anyone else.
 *  - Others may only manage users strictly below them, and only assign roles strictly below their own.
 */
export function canManageUser(actor: { id: string; role: Role }, target: { id: string; role: Role }, newRole?: Role): { ok: boolean; reason?: string } {
  if (actor.id === target.id) return { ok: false, reason: 'Kamu tidak dapat mengubah peran atau status akunmu sendiri.' };
  if (ROLE_RANK[actor.role] < ROLE_RANK.ADMIN) return { ok: false, reason: 'Hanya ADMIN ke atas yang dapat mengelola pengguna.' };
  if (actor.role === 'SUPER_ADMIN') return { ok: true };
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) return { ok: false, reason: 'Kamu tidak dapat mengelola pengguna dengan peran setara atau lebih tinggi.' };
  if (newRole && ROLE_RANK[newRole] >= ROLE_RANK[actor.role]) return { ok: false, reason: 'Kamu tidak dapat memberikan peran setara atau lebih tinggi dari peranmu.' };
  return { ok: true };
}
