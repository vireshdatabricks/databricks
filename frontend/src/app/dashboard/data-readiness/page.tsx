import AwaitingSourcePage from '../components/awaiting-source-page';
import MetricAvailability from '../components/metric-availability';

export default function DataReadinessPage() {
    return <AwaitingSourcePage
        title="Data readiness"
        summary="What the current extracts can measure, and which measures wait for new sources."
        needs="The supplied snapshot extracts do not include ordered event history, journals/work notes, governed attachments, contractual rules, review/action records, or Finance outcomes."
    ><MetricAvailability /></AwaitingSourcePage>;
}
