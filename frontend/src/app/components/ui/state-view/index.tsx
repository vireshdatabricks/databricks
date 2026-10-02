'use client';

import { Box, CircularProgress, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import Button from '../button';

export type ViewState = 'loading' | 'empty' | 'error' | 'unavailable' | 'forbidden' | 'not_found';
type Props = { state: ViewState; title?: string; description?: string; onRetry?: () => void; action?: React.ReactNode; children?: React.ReactNode; };

const defaults: Record<ViewState, { title: string; description: string }> = {
  loading: { title: 'Loading', description: 'Please wait while this information loads.' },
  empty: { title: 'Nothing to show yet', description: 'There is no information to display for this selection.' },
  error: { title: 'Something went wrong', description: 'The information could not be loaded. Try again.' },
  unavailable: { title: 'Service unavailable', description: 'This information is temporarily unavailable. Try again shortly.' },
  forbidden: { title: 'You do not have access', description: 'Your account is not authorised to view this information.' },
  not_found: { title: 'Not found', description: 'This item may have been removed or the link may be out of date.' },
};

export default function StateView({ state, title, description, onRetry, action, children }: Props) {
  const copy = defaults[state];
  const Icon = state === 'forbidden' ? LockOutlinedIcon : state === 'empty' || state === 'not_found' ? SearchOffOutlinedIcon : ErrorOutlineIcon;
  return <Box role={state === 'loading' ? 'status' : 'alert'} aria-live={state === 'loading' ? 'polite' : 'assertive'} sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 1, p: 3 }}>
    {state === 'loading' ? <CircularProgress size={28} aria-label={title ?? copy.title} /> : <Icon color={state === 'empty' || state === 'not_found' ? 'disabled' : 'action'} aria-hidden="true" />}
    <Typography variant="h3" component="h2">{title ?? copy.title}</Typography>
    <Typography color="text.secondary">{description ?? copy.description}</Typography>
    {children}
    {action}
    {onRetry && (state === 'error' || state === 'unavailable') && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
  </Box>;
}
