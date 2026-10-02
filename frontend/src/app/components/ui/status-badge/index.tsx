"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { labelFor, statusBadgeLabels } from "../../../lib/labels";

/** Implements reference/39 §5.3: one text, icon, and semantic treatment for every evidence state. */
export type StatusBadgeStatus =
  | "available"
  | "queued"
  | "running"
  | "packaged"
  | "imported"
  | "failed"
  | "cancelled"
  | "partial"
  | "proxy"
  | "candidate"
  | "unvalidated"
  | "validated"
  | "revised"
  | "rejected"
  | "superseded"
  | "awaiting-source"
  | "contractual"
  | "in-review"
  | "ready-to-sign-off"
  | "signed-off"
  | "draft"
  | "active"
  | "retired"
  | "not-published"
  | "computed-fact"
  | "model-classification"
  | "measured"
  | "substitute"
  | "metric-candidate"
  | "not-available";
export type StatusBadgeValue = StatusBadgeStatus
  | "IN_REVIEW" | "REVIEWED" | "SUPERSEDED" | "READY_TO_SIGN_OFF" | "SIGNED_OFF" | "DRAFT" | "ACTIVE" | "RETIRED" | "NOT_PUBLISHED"
  | "COMPUTED" | "MODEL" | "DIRECT" | "PROXY" | "CANDIDATE" | "NOT_AVAILABLE" | "QUEUED" | "RUNNING" | "PACKAGED" | "IMPORTED" | "FAILED" | "CANCELLED";

const backendStatusMap: Partial<Record<StatusBadgeValue, StatusBadgeStatus>> = {
  IN_REVIEW: "in-review",
  REVIEWED: "ready-to-sign-off",
  SUPERSEDED: "superseded",
  READY_TO_SIGN_OFF: "ready-to-sign-off",
  SIGNED_OFF: "signed-off",
  DRAFT: "draft",
  ACTIVE: "active",
  RETIRED: "retired",
  NOT_PUBLISHED: "not-published",
  COMPUTED: "computed-fact",
  // reference/51 §2 metric labels.
  DIRECT: "measured",
  PROXY: "substitute",
  CANDIDATE: "metric-candidate",
  NOT_AVAILABLE: "not-available",
  MODEL: "model-classification",
  QUEUED: "queued",
  RUNNING: "running",
  PACKAGED: "packaged",
  IMPORTED: "imported",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const statusPresentation = {
  available: {
    label: "Direct fact",
    description: "Counted directly from the published extract.",
    tone: "success",
    icon: <CheckCircleOutlineIcon />,
  },
  partial: {
    label: "Proxy",
    description: "Approximates the measure; does not establish it.",
    tone: "warning",
    icon: <WarningAmberIcon />,
  },
  proxy: {
    label: "Proxy",
    description: "Approximates the measure; does not establish it.",
    tone: "warning",
    icon: <WarningAmberIcon />,
  },
  candidate: {
    label: "Candidate",
    description: "Generated or grouped automatically; not yet reviewed.",
    tone: "information",
    icon: <InfoOutlinedIcon />,
  },
  unvalidated: {
    label: "Unvalidated",
    description: "Model-drafted with citations; awaiting reviewer decision.",
    tone: "information",
    icon: <InfoOutlinedIcon />,
  },
  validated: {
    label: "Validated",
    description: "A named reviewer validated it on a stated date.",
    tone: "success",
    icon: <CheckCircleOutlineIcon />,
  },
  revised: {
    label: "Revised",
    description: "A reviewer changed the text; the original is kept in the audit history.",
    tone: "information",
    icon: <InfoOutlinedIcon />,
  },
  rejected: {
    label: "Rejected",
    description: "A reviewer rejected it; excluded from validated-only exports.",
    tone: "neutral",
    icon: <RemoveCircleOutlineIcon />,
  },
  superseded: {
    label: "Superseded",
    description: "A newer report version replaces this one.",
    tone: "neutral",
    icon: <RemoveCircleOutlineIcon />,
  },
  "awaiting-source": {
    label: "Awaiting source",
    description: "Required source data has not been supplied.",
    tone: "neutral",
    icon: <HourglassEmptyIcon />,
  },
  contractual: {
    label: "Contractual",
    description: "Reserved for a contractual measure; not used until SLA or PG sources exist.",
    tone: "neutral",
    icon: <HourglassEmptyIcon />,
  },
  "in-review": { label: "In review", description: "A reviewer is assessing this report content.", tone: "information", icon: <InfoOutlinedIcon /> },
  "ready-to-sign-off": { label: "Ready to sign off", description: "Required review decisions are complete and the report awaits sign-off.", tone: "warning", icon: <HourglassEmptyIcon /> },
  "signed-off": { label: "Signed off", description: "A reviewer has signed off this report version.", tone: "success", icon: <CheckCircleOutlineIcon /> },
  draft: { label: "Draft", description: "This promptbook version is editable and has not been activated.", tone: "neutral", icon: <InfoOutlinedIcon /> },
  active: { label: "Active", description: "This promptbook version is active for new report runs.", tone: "success", icon: <CheckCircleOutlineIcon /> },
  retired: { label: "Retired", description: "This promptbook version is retained for history and cannot be edited.", tone: "neutral", icon: <RemoveCircleOutlineIcon /> },
  "not-published": { label: "Not published", description: "This active promptbook version has not been published to the analytics workspace.", tone: "warning", icon: <HourglassEmptyIcon /> },
  "computed-fact": { label: "Computed fact", description: "Calculated directly from the report's source data.", tone: "success", icon: <CheckCircleOutlineIcon /> },
  measured: { label: "Measured", description: "Computed from source fields that mean what the metric says.", tone: "success", icon: <CheckCircleOutlineIcon /> },
  substitute: { label: "Substitute measure", description: "An observable quantity that approximates the metric; the title names what is measured.", tone: "warning", icon: <WarningAmberIcon /> },
  "metric-candidate": { label: "Candidate", description: "Produced by a matching rule; not validated until reviewer-label precision is shown.", tone: "information", icon: <InfoOutlinedIcon /> },
  "not-available": { label: "Not available yet", description: "No source data supports this metric yet; the reason and what unlocks it are shown.", tone: "neutral", icon: <RemoveCircleOutlineIcon /> },
  "model-classification": { label: "Model classification", description: "Assigned by a model and requires review before it is treated as validated.", tone: "information", icon: <InfoOutlinedIcon /> },
  queued: { label: "Queued", description: "The report run is waiting for an available job slot.", tone: "neutral", icon: <HourglassEmptyIcon /> },
  running: { label: "Running", description: "The report is being generated.", tone: "information", icon: <HourglassEmptyIcon /> },
  packaged: { label: "Packaged", description: "The report package is ready and is being imported.", tone: "warning", icon: <HourglassEmptyIcon /> },
  imported: { label: "Imported", description: "The report is ready to review.", tone: "success", icon: <CheckCircleOutlineIcon /> },
  failed: { label: "Failed", description: "The report run could not be completed.", tone: "warning", icon: <WarningAmberIcon /> },
  cancelled: { label: "Cancelled", description: "The report run was cancelled.", tone: "neutral", icon: <RemoveCircleOutlineIcon /> },
} as const;

type StatusBadgeProps = {
  status: StatusBadgeValue;
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const presentation = statusPresentation[backendStatusMap[status] ?? status as StatusBadgeStatus];
  const toneStyles = {
    success: {
      color: "brand.success",
      backgroundColor: "brand.successLight",
    },
    warning: {
      color: "brand.enterpriseDarkGray",
      backgroundColor: "brand.warningLight",
    },
    information: {
      color: "brand.information",
      backgroundColor: "brand.informationLight",
    },
    neutral: {
      color: "brand.enterpriseDarkGray",
      backgroundColor: "brand.ash",
    },
  }[presentation.tone];

  return (
    <Tooltip title={presentation.description}>
      <Chip
        size="small"
        label={labelFor(statusBadgeLabels, backendStatusMap[status] ?? status as StatusBadgeStatus)}
        icon={presentation.icon}
        aria-label={`${labelFor(statusBadgeLabels, backendStatusMap[status] ?? status as StatusBadgeStatus)}: ${presentation.description}`}
        sx={{
          ...toneStyles,
          fontWeight: 700,
          "& .MuiChip-icon": { color: "inherit" },
        }}
      />
    </Tooltip>
  );
};

export default StatusBadge;
