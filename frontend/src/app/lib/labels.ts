import { humanizeIdentifier } from './format';

export type LabelEntry = { label: string; meaning?: string };
export const reportStatusLabels = {
  IN_REVIEW: { label: 'In review' }, REVIEWED: { label: 'Ready to sign off' }, READY_TO_SIGN_OFF: { label: 'Ready to sign off' },
  SIGNED_OFF: { label: 'Signed off' }, SUPERSEDED: { label: 'Superseded' },
} satisfies Record<string, LabelEntry>;
export const decisionStatusLabels = {
  UNVALIDATED: { label: 'Undecided' }, PENDING: { label: 'Undecided' }, undecided: { label: 'Undecided' }, CANDIDATE_REQUIRES_REVIEW: { label: 'Candidate' }, VALIDATED: { label: 'Validated' },
  REVISED: { label: 'Revised' }, REJECTED: { label: 'Rejected' }, DUPLICATE: { label: 'Duplicate' },
  ADDITIONAL_EVIDENCE_REQUIRED: { label: 'Needs more evidence' },
} satisfies Record<string, LabelEntry>;
export const evidenceSegmentLabels: Record<string, LabelEntry> = {
  case_short_description: { label: 'Case short description' }, case_description: { label: 'Case description' },
  case_close_notes: { label: 'Case close notes' }, task_short_description: { label: 'Task short description' },
  task_description: { label: 'Task description' }, task_close_notes: { label: 'Task close notes' },
  CASE: { label: 'Case' }, TASK: { label: 'Task' },
};
export const exportFormatLabels = { html: { label: 'HTML' }, xlsx: { label: 'Excel' } } satisfies Record<string, LabelEntry>;
export const exportContentLabels = {
  all: { label: 'All items — unvalidated items watermarked' },
  validated: { label: 'Validated items only', meaning: 'Includes revised items; leaves out undecided and rejected items.' },
} satisfies Record<string, LabelEntry>;
export const exportStatusLabels = {
  available: { label: 'Available' }, unavailable: { label: 'Unavailable' },
} satisfies Record<string, LabelEntry>;
export const requestStateLabels = {
  QUEUED: { label: 'Queued' }, RUNNING: { label: 'Running' }, PACKAGED: { label: 'Packaged' }, IMPORTED: { label: 'Imported' },
  FAILED: { label: 'Failed' }, CANCELLED: { label: 'Cancelled' },
} satisfies Record<string, LabelEntry>;
export const promptbookStatusLabels = {
  DRAFT: { label: 'Draft' }, ACTIVE: { label: 'Active' }, RETIRED: { label: 'Retired' }, NOT_PUBLISHED: { label: 'Not published' },
} satisfies Record<string, LabelEntry>;
export const itemOriginLabels = {
  COMPUTED: { label: 'Computed fact' }, TEMPLATE: { label: 'Template' }, MODEL: { label: 'Model classification' },
} satisfies Record<string, LabelEntry>;
export const itemKindLabels = {
  THEME: { label: 'Theme' }, FINDING: { label: 'Finding' }, SUMMARY: { label: 'Summary' },
} satisfies Record<string, LabelEntry>;
export const causeKindLabels = {
  CONFIGURATION: { label: 'Configuration' }, DATA: { label: 'Data' }, PROCESS: { label: 'Process' }, TRAINING: { label: 'Training' },
  COMMUNICATION: { label: 'Communication' }, SYSTEM: { label: 'System' }, POLICY: { label: 'Policy' }, INDETERMINATE: { label: 'Indeterminate' },
} satisfies Record<string, LabelEntry>;
export const sectionKindLabels = {
  EXECUTIVE_SUMMARY: { label: 'Executive summary' }, THEMES: { label: 'Themes' }, FINDINGS: { label: 'Findings' },
  EVIDENCE: { label: 'Evidence' }, RECOMMENDATIONS: { label: 'Recommendations' },
} satisfies Record<string, LabelEntry>;
export const promptbookSectionLabels: Record<string, LabelEntry> = {
  meta: { label: 'About' }, focus: { label: 'Focus' }, scope: { label: 'Scope' }, lens: { label: 'Lens' },
  report_template: { label: 'Report template' }, grouping: { label: 'Grouping' }, classification: { label: 'Classification' },
  causes: { label: 'Causes' }, recommendations: { label: 'Recommendations' }, style: { label: 'Style' },
  thresholds: { label: 'Thresholds' }, evidence: { label: 'Evidence' },
};
export const modelLabels: Record<string, LabelEntry> = {
  'databricks-gpt-oss-20b': { label: 'GPT OSS 20B', meaning: 'Runs inside the Databricks workspace' },
  'databricks-meta-llama-3-3-70b-instruct': { label: 'Llama 3.3 70B Instruct', meaning: 'Runs inside the Databricks workspace' },
  'gpt-4o': { label: 'GPT-4o', meaning: 'Sends case text to OpenAI' },
  'gpt-4.1': { label: 'GPT-4.1', meaning: 'Sends case text to OpenAI' },
};
export const statusBadgeLabels: Record<string, LabelEntry> = {
  available: { label: 'Direct fact' }, queued: { label: 'Queued' }, running: { label: 'Running' }, packaged: { label: 'Packaged' },
  imported: { label: 'Imported' }, failed: { label: 'Failed' }, cancelled: { label: 'Cancelled' }, partial: { label: 'Proxy' }, proxy: { label: 'Proxy' },
  candidate: { label: 'Candidate' }, unvalidated: { label: 'Unvalidated' }, validated: { label: 'Validated' }, revised: { label: 'Revised' },
  rejected: { label: 'Rejected' }, superseded: { label: 'Superseded' }, 'awaiting-source': { label: 'Awaiting source' }, contractual: { label: 'Contractual' },
  'in-review': { label: 'In review' }, 'ready-to-sign-off': { label: 'Ready to sign off' }, 'signed-off': { label: 'Signed off' }, draft: { label: 'Draft' },
  active: { label: 'Active' }, retired: { label: 'Retired' }, 'not-published': { label: 'Not published' }, 'computed-fact': { label: 'Computed fact' },
  'model-classification': { label: 'Model classification' }, measured: { label: 'Measured' }, substitute: { label: 'Substitute measure' },
  'metric-candidate': { label: 'Candidate' }, 'not-available': { label: 'Not available yet' },
};
export const citationRecordLabels: Record<string, LabelEntry> = {
  CASE: { label: 'Case' }, ATTACHMENT: { label: 'Attachment' }, FILE: { label: 'File' },
  WORKBOOK: { label: 'Workbook' }, SHEET: { label: 'Sheet' }, ROW: { label: 'Row' },
};

const warned = new Set<string>();
export function labelFor<T extends Record<string, LabelEntry>>(map: T, value: string): string {
  const entry = map[value];
  if (entry) return entry.label;
  if (process.env.NODE_ENV === 'development' && !warned.has(value)) {
    warned.add(value);
    console.warn(`Unknown display label: ${value}`);
  }
  return humanizeIdentifier(value);
}
