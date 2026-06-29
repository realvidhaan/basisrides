-- Remove the DB-side report-alert email trigger added in 20260629120300.
-- The operator already runs a self-hosted n8n workflow (W1) that handles
-- abuse-report alerts, so this trigger is redundant and would double-notify.
-- (W1 could not be verified from the agent environment — the n8n MCP only
-- reaches the cloud instance, not the self-hosted localhost:5678 one.)

drop trigger if exists trg_notify_report_inserted on public.reports;
drop function if exists public.notify_report_inserted();
