BEGIN;
SELECT plan(6);

-- Rows written before claims existed, or by the previous function version,
-- count as processed.
INSERT INTO public.webhook_events (id, event_type) VALUES ('evt_legacy', 'invoice.paid');
SELECT is(public.claim_webhook_event('evt_legacy', 'invoice.paid'), 'duplicate',
  'an event recorded by the previous webhook version is a duplicate');

SELECT is(public.claim_webhook_event('evt_new', 'invoice.paid'), 'claimed',
  'the first delivery claims a new event');
SELECT is(public.claim_webhook_event('evt_new', 'invoice.paid'), 'in_progress',
  'a concurrent delivery is told to retry, not acknowledged');

UPDATE public.webhook_events SET processed_at = now() - interval '11 minutes' WHERE id = 'evt_new';
SELECT is(public.claim_webhook_event('evt_new', 'invoice.paid'), 'claimed',
  'a retry takes over a claim abandoned for over ten minutes');

SELECT public.complete_webhook_event('evt_new');
SELECT is(public.claim_webhook_event('evt_new', 'invoice.paid'), 'duplicate',
  'a completed event is a duplicate');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.claim_webhook_event(text, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.complete_webhook_event(text)', 'EXECUTE'),
  'only the service role can claim or complete webhook events'
);

SELECT * FROM finish();
ROLLBACK;
