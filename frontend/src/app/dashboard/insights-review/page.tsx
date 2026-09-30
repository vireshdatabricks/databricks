import AwaitingSourcePage from '../components/awaiting-source-page';

export default function InsightsReviewPage() {
    return <AwaitingSourcePage
        title="Insights review"
        summary="A future workspace for business validation and action follow-up."
        needs="Disposition rates, confidence precision, actionability, and complete evidence-traceability measures need immutable insight, review, evidence, action, and outcome records."
        availableHref="/dashboard/reports"
        availableLabel="Review the current Fast Facts draft"
    />;
}
