'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../../components/ui';
import type { DataColumn } from '../../components/ui/data-table';
import { failureState, listPromptbooks, type PromptbookRow } from '../../lib/api/promptbooks';
import { formatDate, humanizeIdentifier } from '../../lib/format';

function displayName(row: PromptbookRow) { return row.name ?? humanizeIdentifier(row.promptbook_id); }

export default function PromptbookListPage() {
  const [rows, setRows] = useState<PromptbookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ state: 'unavailable' | 'forbidden' | 'not_found' | 'error'; description: string }>();
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const result = await listPromptbooks();
    if (result.ok) setRows(result.data.data);
    else setError({ state: failureState(result) ?? 'error', description: result.error.message });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const columns: DataColumn<PromptbookRow>[] = [
    { id: 'name', label: 'Promptbook', sortable: true, minWidth: 240, value: displayName, render: (row) => <Stack spacing={0.5}><Link href={`/dashboard/promptbook/${encodeURIComponent(row.promptbook_id)}`}>{displayName(row)}</Link>{row.kind === 'override' && <Typography variant="body2" color="text.secondary">Override of a base promptbook</Typography>}</Stack> },
    { id: 'active_version', label: 'Active version', nowrap: true, value: (row) => row.active_version == null ? 'None' : `v${row.active_version}` },
    { id: 'published_at', label: 'Publication', render: (row) => row.published_at ? `Published ${formatDate(row.published_at)}` : <Brand.StatusBadge status="NOT_PUBLISHED" /> },
    { id: 'latest_draft', label: 'Draft', render: (row) => row.latest_draft == null ? '—' : <Link href={`/dashboard/promptbook/${encodeURIComponent(row.promptbook_id)}/drafts/${row.latest_draft}`}>Edit draft v{row.latest_draft}</Link> },
    { id: 'action', label: 'Action', nowrap: true, render: (row) => <Brand.Button variant="secondary" size="compact" component={Link} href={`/dashboard/promptbook/${encodeURIComponent(row.promptbook_id)}`}>Open</Brand.Button> },
  ];
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Brand.PageHeader title="Promptbooks" description="Promptbooks define what a report analyses and how it is written. Report runs use the published version." />
    <Brand.DataTable rows={rows} columns={columns} getRowId={(row) => row.promptbook_id} loading={loading} error={error} onRetry={() => void load()} label="Promptbooks" resultLabel="promptbook" emptyTitle="No promptbooks yet" emptyDescription="Promptbooks appear here once a version has been created." />
  </Box>;
}
