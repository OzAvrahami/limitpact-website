CREATE TABLE limitpact_web.submissions (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('contact', 'beta')),
  name text NOT NULL,
  email text NOT NULL,
  message text,
  platform text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notification_status text NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sending', 'failed', 'provider_accepted', 'manual_review')),
  notification_payload jsonb,
  notification_generation integer NOT NULL DEFAULT 1,
  notification_attempt uuid,
  notification_attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  resend_id text,
  provider_accepted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'unknown'
    CHECK (delivery_status IN ('unknown', 'delivered', 'bounced', 'complained', 'failed')),
  provider_last_event text,
  delivery_checked_at timestamptz,
  CHECK ((form_type = 'contact' AND message IS NOT NULL AND platform IS NULL)
    OR (form_type = 'beta' AND message IS NULL AND platform IN ('Tradovate', 'NinjaTrader', 'Other')))
);

CREATE INDEX submissions_created ON limitpact_web.submissions (created_at);
CREATE INDEX submissions_email_created ON limitpact_web.submissions (email, created_at);
CREATE INDEX submissions_notification_queue ON limitpact_web.submissions (notification_status, last_attempt_at);
