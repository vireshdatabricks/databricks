'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel } from '@mui/material';
import StateView, { type ViewState } from '../state-view';
import { radius } from '../../../utils/theme';

export type DataColumn<T> = { id: keyof T | string; label: string; sortable?: boolean; align?: 'left' | 'right' | 'center'; width?: number | string; minWidth?: number | string; /** Keep dates, periods and statuses on one line (S20). */ nowrap?: boolean; /** Clamp long text (titles, client lists) to this many lines. */ maxLines?: number; render?: (row: T) => React.ReactNode; value?: (row: T) => string | number | null | undefined };
type Props<T> = { rows: T[]; columns: DataColumn<T>[]; getRowId: (row: T) => string | number; loading?: boolean; error?: { state?: Extract<ViewState, 'error' | 'unavailable' | 'forbidden' | 'not_found'>; title?: string; description?: string }; emptyTitle?: string; emptyDescription?: string; onRetry?: () => void; rowsPerPageOptions?: number[]; initialRowsPerPage?: number; label?: string; resultLabel?: string; bordered?: boolean };

function cellContent<T>(column: DataColumn<T>, row: T): React.ReactNode {
  return column.render ? column.render(row) : String(column.value ? column.value(row) ?? '—' : (row as Record<string, unknown>)[String(column.id)] ?? '—');
}

export default function DataTable<T>({ rows, columns, getRowId, loading = false, error, emptyTitle, emptyDescription, onRetry, rowsPerPageOptions = [10, 25, 50], initialRowsPerPage = 10, label = 'Results', resultLabel = 'result', bordered = true }: Props<T>) {
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialRowsPerPage);
  const sorted = useMemo(() => {
    if (!sortBy) return rows;
    const col = columns.find((column) => String(column.id) === sortBy);
    return rows.map((row, index) => ({ row, index })).sort((a, b) => {
      const left = col?.value ? col.value(a.row) : (a.row as Record<string, unknown>)[sortBy];
      const right = col?.value ? col.value(b.row) : (b.row as Record<string, unknown>)[sortBy];
      const cmp = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return (direction === 'asc' ? cmp : -cmp) || a.index - b.index;
    }).map(({ row }) => row);
  }, [rows, columns, sortBy, direction]);
  useEffect(() => { if (page > 0 && page * pageSize >= rows.length) setPage(Math.max(0, Math.ceil(rows.length / pageSize) - 1)); }, [page, pageSize, rows.length]);
  if (loading) return <StateView state="loading" title={`Loading ${label.toLowerCase()}`} />;
  if (error) return <StateView state={error.state ?? 'error'} title={error.title} description={error.description} onRetry={onRetry} />;
  if (!rows.length) return <StateView state="empty" title={emptyTitle} description={emptyDescription} />;
  const start = page * pageSize;
  const showPagination = rows.length > Math.min(...rowsPerPageOptions);
  return <Paper variant={bordered ? 'outlined' : 'elevation'} elevation={0} sx={{ border: bordered ? undefined : 0, borderRadius: radius.card, overflow: 'hidden' }}>
    <TableContainer sx={{ overflowX: 'auto' }}><Table aria-label={label} size="medium"><TableHead><TableRow>{columns.map((column) => <TableCell key={String(column.id)} align={column.align} sx={{ width: column.width, minWidth: column.minWidth }}>{column.sortable ? <TableSortLabel active={sortBy === String(column.id)} direction={sortBy === String(column.id) ? direction : 'asc'} onClick={() => { const key = String(column.id); setDirection(sortBy === key && direction === 'asc' ? 'desc' : 'asc'); setSortBy(key); setPage(0); }}>{column.label}</TableSortLabel> : column.label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{sorted.slice(start, start + pageSize).map((row) => <TableRow hover key={getRowId(row)}>{columns.map((column) => <TableCell key={String(column.id)} align={column.align} sx={{ width: column.width, minWidth: column.minWidth, whiteSpace: column.nowrap ? 'nowrap' : undefined }}>{column.maxLines ? <Box sx={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: column.maxLines, overflow: 'hidden' }}>{cellContent(column, row)}</Box> : cellContent(column, row)}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
    {showPagination && <TablePagination component="div" count={rows.length} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={rowsPerPageOptions} labelRowsPerPage="Rows per page" labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count} ${count === 1 ? resultLabel : `${resultLabel}s`}`} />}
  </Paper>;
}
