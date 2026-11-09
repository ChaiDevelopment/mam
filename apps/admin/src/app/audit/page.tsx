'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@mam/api-client';
import { useState } from 'react';
import { Card, Empty, ErrorBox, Loading, PageHeader, Pager } from '@/components/ui';
import { api } from '@/lib/api';

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', action, page], queryFn: () => api.admin.auditLogs({ action: action || undefined, page, pageSize: 50 }) });
  return (
    <>
      <PageHeader title="Log audit" subtitle="Setiap tindakan administratif tercatat dan tidak dapat diubah dari dasbor." />
      <input aria-label="Filter aksi" placeholder="Filter aksi, mis. USER_SUSPENDED" value={action} onChange={(e) => (setAction(e.target.value.toUpperCase()), setPage(1))} className="mb-4 h-9 w-72 rounded-md border border-border bg-surface px-3 text-small" />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <Empty text="Belum ada entri." /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-small">
            <thead className="bg-surface-muted text-left text-caption text-text-muted">
              <tr><th className="p-3">Waktu (WIB)</th><th className="p-3">Pelaku</th><th className="p-3">Aksi</th><th className="p-3">Target</th><th className="p-3">Detail</th></tr>
            </thead>
            <tbody>
              {q.data.items.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap p-3">{formatDate(l.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}</td>
                  <td className="p-3">{l.actor ? `${l.actor.displayName} (${l.actor.role})` : 'Sistem'}<br /><span className="text-caption text-text-muted">{l.ip}</span></td>
                  <td className="p-3 font-semibold">{l.action}</td>
                  <td className="p-3">{l.targetType}<br /><code className="text-caption">{l.targetId}</code></td>
                  <td className="p-3"><pre className="max-w-md whitespace-pre-wrap break-words text-caption text-text-muted">{l.metadata ? JSON.stringify(l.metadata, null, 1) : '—'}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3"><Pager page={page} total={q.data.total} hasMore={q.data.hasMore} onPage={setPage} /></div>
        </Card>
      )}
    </>
  );
}
