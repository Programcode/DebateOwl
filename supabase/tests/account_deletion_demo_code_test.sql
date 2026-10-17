BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES
  ('a6000000-0000-4000-8000-00000000000a', 'demo-student@example.test'),
  ('a6000000-0000-4000-8000-00000000000b', 'other-student@example.test');
INSERT INTO public.demo_access_codes (code_hash, label, email, role) VALUES
  ('hash-a6', 'Example School, Year 10', 'demo-student@example.test', 'user'),
  ('hash-a6-other', 'Example School, Year 11', 'other-student@example.test', 'user');
INSERT INTO public.demo_access_attempts (code_hash, ip_address, browser_fingerprint, success) VALUES
  ('hash-a6', '203.0.113.7', 'fp-a6', true),
  ('hash-a6-other', '203.0.113.8', 'fp-other', true);

-- The account Edge Function's database steps.
SET LOCAL ROLE service_role;
SELECT public.prepare_account_deletion('a6000000-0000-4000-8000-00000000000a');
RESET ROLE;
DELETE FROM auth.users WHERE id = 'a6000000-0000-4000-8000-00000000000a';

SELECT is_empty(
  $$SELECT 1 FROM public.demo_access_codes WHERE email = 'demo-student@example.test'$$,
  'the deleted user''s demo code no longer holds their email and cannot recreate the account'
);
SELECT is_empty(
  $$SELECT 1 FROM public.demo_access_attempts
    WHERE code_hash = 'hash-a6' AND (ip_address IS NOT NULL OR browser_fingerprint IS NOT NULL)$$,
  'sign-in attempts for the deleted user''s code keep no IP address or fingerprint'
);
SELECT is(
  (SELECT count(*) FROM public.demo_access_attempts
   WHERE code_hash = 'hash-a6-other' AND ip_address IS NOT NULL),
  1::bigint,
  'another student''s code and attempts are untouched'
);

SELECT * FROM finish();
ROLLBACK;
