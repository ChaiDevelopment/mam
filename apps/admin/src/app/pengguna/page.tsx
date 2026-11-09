'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { ROLE_RANK, Roles, type AdminUserRow, type Role } from '@mam/shared-types';
import { useState } from 'react';
import { hasRole, useMe, useToast } from '@/components/shell';
import { Button, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, ReasonField, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';

export default function UsersPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'>('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<AdminUserRow | null>(null);
  const q = useQuery({ queryKey: ['users', search, role, status, page], queryFn: () => api.admin.users({ q: search || undefined, role: role || undefined, status: status || undefined, page, pageSize: 25 }) });
  const canManage = (u: AdminUserRow) => u.userId !== me.userId && hasRole(me, 'ADMIN') && (me.role === 'SUPER_ADMIN' || ROLE_RANK[u.role] < ROLE_RANK[me.role]);
  return (
    <>
      <PageHeader title="Pengguna" subtitle="Cari, tangguhkan, pulihkan, atau ubah peran. Semua perubahan dicatat di log audit." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Cari email, username, nama" placeholder="Cari email / username / nama" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="h-9 min-w-[240px] rounded-md border border-border bg-surface px-3 text-small" />
        <select aria-label="Filter peran" value={role} onChange={(e) => (setRole(e.target.value as Role | ''), setPage(1))} className="h-9 rounded-md border border-border bg-surface px-2 text-small">
          <option value="">Semua peran</option>
          {Roles.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => (setStatus(e.target.value as typeof status), setPage(1))} className="h-9 rounded-md border border-border bg-surface px-2 text-small">
          <option value="">Semua status</option>
          <option>ACTIVE</option>
          <option>SUSPENDED</option>
          <option>DELETED</option>
        </select>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <Empty text="Tidak ada pengguna." /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-small">
            <thead className="bg-surface-muted text-left text-caption text-text-muted">
              <tr>
                <th className="p-3">Pengguna</th><th className="p-3">Peran</th><th className="p-3">Status</th><th className="p-3 text-right">Ulasan</th><th className="p-3 text-right">Dilaporkan</th><th className="p-3">Terakhir aktif</th><th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="p-3"><strong>{u.displayName}</strong><br /><span className="text-caption text-text-muted">@{u.username} · {u.email}</span></td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3"><StatusPill status={u.status} /></td>
                  <td className="p-3 text-right tabular-nums">{u.reviewCount}</td>
                  <td className="p-3 text-right tabular-nums">{u.reportCount}</td>
                  <td className="p-3 text-text-muted">{u.lastActiveAt ? formatDate(u.lastActiveAt) : '—'}</td>
                  <td className="p-3 text-right">{canManage(u) && u.status !== 'DELETED' && <Button variant="outline" onClick={() => setEdit(u)}>Kelola</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3"><Pager page={page} total={q.data.total} hasMore={q.data.hasMore} onPage={setPage} /></div>
        </Card>
      )}
      {edit && <ManageDialog user={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ManageDialog({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [reason, setReason] = useState('');
  const assignable = Roles.filter((r) => me.role === 'SUPER_ADMIN' || ROLE_RANK[r] < ROLE_RANK[me.role]);
  const m = useMutation({
    mutationFn: (b: { status?: 'ACTIVE' | 'SUSPENDED'; role?: Role }) => api.admin.updateUser(user.userId, { ...b, reason }),
    onSuccess: () => {
      toast('success', 'Perubahan disimpan.');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  const ok = reason.trim().length >= 5;
  return (
    <Dialog open title={`Kelola ${user.displayName}`} onClose={onClose}>
      <ReasonField value={reason} onChange={setReason} />
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-small font-semibold">
          Peran
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 block h-9 rounded-md border border-border bg-surface px-2">
            {assignable.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <Button disabled={!ok || role === user.role} loading={m.isPending} onClick={() => m.mutate({ role })}>Ubah peran</Button>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        {user.status === 'ACTIVE' ? (
          <Button variant="danger" disabled={!ok} onClick={() => m.mutate({ status: 'SUSPENDED' })}>Tangguhkan akun (semua sesi dicabut)</Button>
        ) : (
          <Button disabled={!ok} onClick={() => m.mutate({ status: 'ACTIVE' })}>Pulihkan akun</Button>
        )}
      </div>
    </Dialog>
  );
}
