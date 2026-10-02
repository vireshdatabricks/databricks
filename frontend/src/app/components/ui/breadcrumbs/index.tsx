'use client';

import Link from 'next/link';
import { Breadcrumbs as MuiBreadcrumbs, Typography } from '@mui/material';
export type BreadcrumbItem = { label: string; href?: string };
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return <MuiBreadcrumbs aria-label="Breadcrumb" sx={{ '& .MuiBreadcrumbs-separator': { mx: 1 } }}>{items.map((item, index) => item.href && index < items.length - 1 ? <Link key={`${item.label}-${index}`} href={item.href} style={{ color: 'inherit' }}>{item.label}</Link> : <Typography key={`${item.label}-${index}`} color="text.primary" aria-current="page">{item.label}</Typography>)}</MuiBreadcrumbs>;
}
