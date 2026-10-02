import { Box, type SxProps, type Theme } from '@mui/material';

/** Buttons that act together: 12 px apart and wrapping (reference/48 S24; 8 px only for compact toolbars). */
export default function ActionGroup({ children, compact = false, justify = 'flex-start', sx }: { children: React.ReactNode; compact?: boolean; justify?: 'flex-start' | 'flex-end' | 'space-between'; sx?: SxProps<Theme> }) {
  return <Box sx={[{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 1 : 1.5, justifyContent: justify }, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Box>;
}
