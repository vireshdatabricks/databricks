'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SelectChangeEvent } from '@mui/material';

import * as Brand from '../../components/ui';
import { getMetadata } from '../../utils/analytics-api';

// Published weeks are discrete snapshots, not an arbitrary date range, so this offers a bounded dropdown.
export default function WeekSelect() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [weeks, setWeeks] = React.useState<string[]>([]);

    React.useEffect(() => {
        let cancelled = false;
        getMetadata()
            .then((envelope) => {
                if (!cancelled) setWeeks(envelope.data.available_weeks);
            })
            .catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

    const current = searchParams.get('as_of_week') ?? 'latest';

    const handleChange = (event: SelectChangeEvent<string | string[]>) => {
        const value = event.target.value as string;
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'latest') params.delete('as_of_week');
        else params.set('as_of_week', value);
        params.delete('cursor');
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <Brand.SelectBox
            label="As of week"
            initialValue={current}
            options={[{ label: 'Latest published week', value: 'latest' }, ...weeks.map((week) => ({ label: week, value: week }))]}
            changeFn={handleChange}
        />
    );
}
