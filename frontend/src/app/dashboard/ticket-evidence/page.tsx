import AwaitingSourcePage from '../components/awaiting-source-page';

export default function TicketEvidencePage() {
    return <AwaitingSourcePage
        title="Ticket evidence"
        summary="Ticket, task, and subtask facts are available through existing case drill-down routes."
        needs="Activity history, work notes, attachments, SLA-rule links, related-case matches, and action/outcome evidence need governed source contracts and access controls before broad dashboard exposure."
        availableHref="/dashboard/recurring-issues"
        availableLabel="Open candidate themes and supporting ticket facts"
    />;
}
