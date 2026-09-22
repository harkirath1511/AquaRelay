-- Run once on the hosted project after migration 008. pg_cron must be enabled
-- by a database administrator; the job runs under a privileged database role.
create extension if not exists pg_cron;
select cron.schedule('aquarelay-exact-location-retention', '0 3 * * *',
  'select private.purge_expired_exact_locations()');
