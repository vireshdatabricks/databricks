'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TextField } from '@mui/material';

interface QueryTextFilterProps {
    label: string;
    paramKey: string;
}

// Free-text filter (assignment group, category, etc.) synced to the URL, debounced to avoid a request per keystroke.
export default function QueryTextFilter({ label, paramKey }: QueryTextFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [value, setValue] = React.useState(searchParams.get(paramKey) ?? '');
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        setValue(searchParams.get(paramKey) ?? '');
    }, [paramKey, searchParams]);

    const applyValue = (next: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next.trim() === '') params.delete(paramKey);
        else params.set(paramKey, next.trim());
        params.delete('cursor');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value;
        setValue(next);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => applyValue(next), 500);
    };

    return (
        <TextField
            label={label}
            size="small"
            value={value}
            onChange={handleChange}
            sx={{ backgroundColor: 'white', minWidth: 180 }}
        />
    );
}
