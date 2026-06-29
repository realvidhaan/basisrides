-- The chat UI promises abuse reports are reviewed "within 24 hours", but a new
-- report only inserted a row — nothing fired to triage. This adds an AFTER
-- INSERT trigger that emails the operator a "go review" ping via Resend (key +
-- recipient read from Vault) using pg_net. Fire-and-forget: net.http_post
-- enqueues after commit, so a Resend hiccup never blocks or loses the report.
--
-- Privacy by design: the email contains NO report PII (no names, no reason, no
-- reporter/reported ids) — only the report id + timestamp so the operator can
-- look it up in the secure console. Family/minor data never leaves the DB.
--
-- Dormant until the `report_alert_to` Vault secret exists.

create or replace function public.notify_report_inserted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
  v_to  text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key'  limit 1;
  select decrypted_secret into v_to  from vault.decrypted_secrets where name = 'report_alert_to' limit 1;
  if v_key is null or v_to is null then
    return new;  -- not configured yet; never block the insert
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'BasisRide Safety <alerts@send.vidhaan.info>',
      'to', jsonb_build_array(v_to),
      'subject', 'New abuse report on BasisRide — review needed',
      'text',
        'A new abuse report was filed on BasisRide and needs review.' || E'\n\n'
        || 'Report id: ' || new.id::text || E'\n'
        || 'Filed at: '  || new.created_at::text || E'\n\n'
        || 'Open the operator console (service role) to see details. No report '
        || 'details are included in this email by design.'
    )
  );
  return new;
end;
$function$;

revoke all on function public.notify_report_inserted() from public;
revoke all on function public.notify_report_inserted() from anon;
revoke all on function public.notify_report_inserted() from authenticated;

drop trigger if exists trg_notify_report_inserted on public.reports;
create trigger trg_notify_report_inserted
  after insert on public.reports
  for each row execute function public.notify_report_inserted();
