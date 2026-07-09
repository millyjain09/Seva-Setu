SELECT
  cron.schedule(
    'daily-health-reminders',
    '0 8 * * *',
    $$
    SELECT
      net.http_post(
        url:='https://khnonltlzeslfyosvunj.supabase.co/functions/v1/daily-health-reminders',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtobm9ubHRsemVzbGZ5b3N2dW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTI3MTgsImV4cCI6MjA4NzU4ODcxOH0.7mIvCiLzOVbSQyzIayyPK1-frm3hXycfcsBPQ02Y4iI"}'::jsonb,
        body:='{}'::jsonb
      ) AS request_id;
    $$
  );