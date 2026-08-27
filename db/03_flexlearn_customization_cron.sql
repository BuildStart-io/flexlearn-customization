-- ============================================================================
-- 03_flexlearn_customization_cron.sql
-- Dedicated scheduled jobs for "flexlearn-customization"
-- Requires pg_cron + pg_net. Run as superuser on remote hosted Postgres.
--
-- Replace:
--   <FUNCTIONS_URL>     e.g. http://kong:8000/functions/v1 or https://supabase.buildstart.io/functions/v1
--   <SERVICE_ROLE_KEY>  your Supabase service role key
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Queue drainer safety net for flexlearn-customization
SELECT cron.schedule(
  'drain-message-queue-flexlearn',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := '<FUNCTIONS_URL>/process-message-flexlearn-customization',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{"trigger":"cron"}'::jsonb
  );
  $$
);

-- Order follow-ups + inactivity follow-ups for flexlearn-customization
SELECT cron.schedule(
  'send-followups-flexlearn',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := '<FUNCTIONS_URL>/send-followups-flexlearn-customization',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Scheduled broadcasts / anti-spam message dispatcher for flexlearn-customization
SELECT cron.schedule(
  'send-scheduled-messages-flexlearn',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := '<FUNCTIONS_URL>/send-scheduled-flexlearn-customization',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Inspect:  SELECT jobid, jobname, schedule FROM cron.job;
-- Remove:   SELECT cron.unschedule('drain-message-queue-flexlearn');
