import { redirect } from 'next/navigation';

export default async function InsightsReviewRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
        else if (value !== undefined) query.set(key, value);
    });
    const suffix = query.toString();
    redirect(`/dashboard/reports${suffix ? `?${suffix}` : ''}`);
}
