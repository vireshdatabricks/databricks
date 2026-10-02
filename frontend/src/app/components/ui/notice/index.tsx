'use client';

import { Alert, AlertTitle } from '@mui/material';
export type NoticeTone = 'success' | 'info' | 'warning' | 'error';
export default function Notice({ tone = 'info', title, children, action }: { tone?: NoticeTone; title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <Alert severity={tone} action={action} role={tone === 'error' ? 'alert' : 'status'}>{title && <AlertTitle>{title}</AlertTitle>}{children}</Alert>;
}
