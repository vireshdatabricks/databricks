import React from 'react';
import { Box, Typography } from '@mui/material';
import Disclosure from '../disclosure';
import ActionGroup from '../action-group';

/** Implements reference/39: one semantic h1, purpose text, and a bounded action area. */
interface PageHeaderProps {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    actionHint?: React.ReactNode;
    details?: Array<{ label: string; value: React.ReactNode }>;
}

const PageHeader = ({ title, description, actions, actionHint, details }: PageHeaderProps) => {
    const hintId = actionHint ? `page-action-hint-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined;
    const describedActions = hintId ? React.Children.map(actions, (action) => React.isValidElement<{ 'aria-describedby'?: string }>(action)
        ? React.cloneElement(action, { 'aria-describedby': [action.props['aria-describedby'], hintId].filter(Boolean).join(' ') })
        : action) : actions;
    return <Box>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0, flex: '1 1 360px' }}>
                <Typography variant="h1" component="h1">{title}</Typography>
                {description && <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>}
            </Box>
            {actions && <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'stretch', md: 'flex-end' }, gap: 1, flex: { xs: '1 1 100%', md: '0 0 auto' }, '& > :first-of-type': { alignSelf: { xs: 'stretch', md: 'flex-end' } } }}>
                <ActionGroup justify="flex-end">{describedActions}</ActionGroup>
                {actionHint && <Typography id={hintId} variant="body2" color="text.secondary" sx={{ textAlign: { xs: 'left', md: 'right' }, width: '100%' }}>{actionHint}</Typography>}
            </Box>}
        </Box>
        {details?.length ? <Disclosure title="Details"><Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 1, m: 0 }}>{details.map((detail) => <React.Fragment key={detail.label}><Typography component="dt" variant="body2" fontWeight={700}>{detail.label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{detail.value}</Typography></React.Fragment>)}</Box></Disclosure> : null}
    </Box>;
};

export default PageHeader;
