'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Box, Divider, Stack, Typography } from '@mui/material';
import * as Brand from '../../../components/ui';
import { createPromptbookDraft, failureState, getPromptbookDiff, getPromptbookVersions, getResolvedPromptbook, type PromptbookDiff, type PromptbookVersion, type ResolvedPromptbook } from '../../../lib/api/promptbooks';
import { formatDate, humanizeIdentifier } from '../../../lib/format';
import { labelFor, promptbookSectionLabels, promptbookStatusLabels } from '../../../lib/labels';
import { radius } from '../../../utils/theme';

const SECTIONS = ['focus', 'scope', 'lens', 'grouping', 'report_template', 'style', 'thresholds'];
function readable(value: unknown): string { if (typeof value === 'string') return value; if (value == null) return '—'; return JSON.stringify(value, null, 2); }
const preSx = { m: 0, p: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', fontSize: '0.9rem', bgcolor: 'action.hover', borderRadius: radius.card } as const;
type LoadError = { state: 'unavailable' | 'forbidden' | 'not_found' | 'error'; message: string };

export default function PromptbookDetailPage() {
  const params = useParams<{ promptbookId: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.promptbookId);
  const [versions, setVersions] = useState<PromptbookVersion[]>([]);
  const [resolved, setResolved] = useState<ResolvedPromptbook>();
  const [diff, setDiff] = useState<PromptbookDiff>();
  const [against, setAgainst] = useState<'base' | 'active'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [createError, setCreateError] = useState('');
  const selected = useMemo(() => versions.find((v) => v.status === 'ACTIVE') ?? versions.at(-1), [versions]);

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const listed = await getPromptbookVersions(id);
    if (!listed.ok) { setError({ state: failureState(listed) ?? 'error', message: listed.error.message }); setLoading(false); return; }
    setVersions(listed.data.data);
    const target = listed.data.data.find((v) => v.status === 'ACTIVE') ?? listed.data.data.at(-1);
    if (target) {
      const result = await getResolvedPromptbook(id, target.version);
      if (result.ok) setResolved(result.data.data); else setError({ state: failureState(result) ?? 'error', message: result.error.message });
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    if (!selected) { setDiff(undefined); return; }
    void getPromptbookDiff(id, selected.version, against).then((result) => { if (!cancelled) setDiff(result.ok ? result.data.data : undefined); });
    return () => { cancelled = true; };
  }, [id, selected, against]);

  const startDraft = async () => {
    if (!note.trim()) { setCreateError('Describe what this draft will change.'); return; }
    setCreating(true); setCreateError('');
    const result = await createPromptbookDraft(id, note.trim());
    setCreating(false);
    if (result.ok) router.push(`/dashboard/promptbook/${encodeURIComponent(id)}/drafts/${result.data.data.version}`);
    else setCreateError(result.error.message);
  };

  const doc = resolved?.document;
  const name = String(doc?.meta?.name ?? selected?.name ?? humanizeIdentifier(id));
  const hasActive = versions.some((v) => v.status === 'ACTIVE');
  const openDraft = versions.find((v) => v.status === 'DRAFT');
  const history = [...versions].reverse().map((v) => ({
    id: v.version,
    time: v.created_at,
    actor: v.created_by,
    action: <>Version {v.version} · {labelFor(promptbookStatusLabels, v.status)} · <Link href={`/dashboard/promptbook/${encodeURIComponent(id)}/drafts/${v.version}`}>{v.status === 'DRAFT' ? 'Edit draft' : 'Open'}</Link></>,
    qualifiers: [v.change_note || 'No change note', v.published_at ? `Published ${formatDate(v.published_at)}` : v.status === 'ACTIVE' ? 'Not published' : null].filter(Boolean).join(' · '),
  }));

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Brand.Breadcrumbs items={[{ label: 'Promptbooks', href: '/dashboard/promptbook' }, { label: name }]} />
    <Brand.PageHeader title={name} description={typeof doc?.focus === 'string' ? doc.focus : 'Versions, resolved rules, and change history.'}
      actions={openDraft ? <Brand.Button component={Link} href={`/dashboard/promptbook/${encodeURIComponent(id)}/drafts/${openDraft.version}`}>Edit draft v{openDraft.version}</Brand.Button> : <Brand.Button disabled={!hasActive} onClick={() => { setCreateError(''); setCreateOpen(true); }}>Create draft</Brand.Button>}
      actionHint={!openDraft && !hasActive && versions.length ? 'A draft starts from the active version; activate a version first.' : undefined}
      details={[{ label: 'Promptbook ID', value: id }, ...(selected ? [{ label: 'Active version', value: `v${selected.version}` }] : []), ...(resolved ? [{ label: 'Resolved hash', value: resolved.resolved_hash }] : [])]} />
    {loading ? <Brand.StateView state="loading" title="Loading promptbook" /> : error ? <Brand.StateView state={error.state} description={error.message} onRetry={() => void load()} /> : versions.length === 0 ? <Brand.StateView state="empty" title="No versions" description="This promptbook has no versions to display." /> : <>
      <Brand.Card variant="outlined" sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="h3" component="h2">Version history</Typography>
        <Brand.ActivityList entries={history} />
      </Brand.Card>
      {resolved && doc && <Brand.Card variant="outlined" sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="h3" component="h2">Rules in v{resolved.version}</Typography>
        {resolved.base && <Typography variant="body2" color="text.secondary">Override of {humanizeIdentifier(resolved.base.promptbook_id)} v{resolved.base.version}. Each section says whether it is changed here or inherited.</Typography>}
        {SECTIONS.map((section, index) => <Box key={section} sx={{ display: 'grid', gap: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1} flexWrap="wrap">
            <Typography variant="h4" component="h3">{labelFor(promptbookSectionLabels, section)}</Typography>
            {resolved.base && <Typography variant="body2" color="text.secondary">{resolved.section_origins?.[section] === 'override' ? 'Changed by this override' : `Inherited from base v${resolved.base.version}`}</Typography>}
          </Stack>
          <Box component="pre" sx={preSx}>{readable(doc[section])}</Box>
          {index < SECTIONS.length - 1 && <Divider />}
        </Box>)}
      </Brand.Card>}
      <Brand.Card variant="outlined" sx={{ display: 'grid', gap: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'flex-end' }}>
          <Typography variant="h3" component="h2">Differences{selected ? ` in v${selected.version}` : ''}</Typography>
          <Brand.SegmentedControl label="Compare with" options={[{ value: 'active', label: 'Active version' }, { value: 'base', label: 'Base promptbook' }]} value={against} onChange={(value) => setAgainst(value as 'active' | 'base')} />
        </Stack>
        {!diff ? <Typography variant="body2" color="text.secondary">There is no {against === 'base' ? 'base promptbook' : 'other active version'} to compare with.</Typography>
          : diff.changed_sections.length === 0 ? <Typography variant="body2" color="text.secondary">No sections differ.</Typography>
          : diff.changed_sections.map((section) => <Box key={section} sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="h4" component="h3">{labelFor(promptbookSectionLabels, section)}</Typography>
            <Typography variant="label">Before</Typography><Box component="pre" sx={{ ...preSx, bgcolor: 'error.light' }}>{readable(diff.sections[section]?.before)}</Box>
            <Typography variant="label">After</Typography><Box component="pre" sx={{ ...preSx, bgcolor: 'success.light' }}>{readable(diff.sections[section]?.after)}</Box>
          </Box>)}
      </Brand.Card>
    </>}
    <Brand.Dialog open={createOpen} title="Create draft" description="The draft starts as a copy of the active version. Report runs are unaffected until it is activated and published." confirmLabel="Create draft" busy={creating} onClose={() => setCreateOpen(false)} onConfirm={() => void startDraft()}>
      <Brand.Field label="Change note" value={note} onChange={(event) => setNote(event.target.value)} required helperText="Describe what this draft will change." errorText={createError || undefined} />
    </Brand.Dialog>
  </Box>;
}
