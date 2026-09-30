import AwaitingSourcePage from '../components/awaiting-source-page';

export default function RecurringIssuesPage() {
    return <AwaitingSourcePage
        title="Recurring issues"
        summary="A future workspace for validated recurrence and issue-prevention learning."
        needs="The required 7-, 14-, and 30-day recurrence measures, long-range recurrence, match precision, false-positive rate, avoidable volume, and remediation effectiveness need historical events and reviewer labels."
        availableHref="/dashboard/themes"
        availableLabel="Review current candidate themes"
    />;
}
