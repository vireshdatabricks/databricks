'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SelectChangeEvent } from '@mui/material';

import * as Brand from '../../components/ui';

interface QueryFilterSelectProps {
    label: string;
    paramKey: string;
    options: { label: string; value: string }[];
}

// Keeps filter state in the URL so it survives navigation, refresh, and sharing.
export default function QueryFilterSelect({ label, paramKey, options }: QueryFilterSelectProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const current = searchParams.get(paramKey) ?? 'all';

    const handleChange = (event: SelectChangeEvent<string | string[]>) => {
        const value = event.target.value as string;
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'all') params.delete(paramKey);
        else params.set(paramKey, value);
        params.delete('cursor');
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <Brand.SelectBox
            label={label}
            initialValue={current}
            options={[{ label: 'All', value: 'all' }, ...options]}
            changeFn={handleChange}
        />
    );
}
