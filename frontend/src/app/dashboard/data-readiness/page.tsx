import AwaitingSourcePage from '../components/awaiting-source-page';

export default function DataReadinessPage() {
    return <AwaitingSourcePage
        title="Data readiness"
        summary="A summary of current extract capability and future measurement dependencies."
        needs="The supplied snapshot extracts do not include ordered event history, journals/work notes, governed attachments, contractual rules, review/action records, or Finance outcomes. The overview availability matrix shows the resulting metric boundary."
    />;
}
