-- Restore the one user-editable preference column omitted from the 2026-08-19
-- column-level user_settings hardening. Authenticated users still cannot INSERT,
-- DELETE, or update entitlement/billing fields.
--
-- IMPORTANT: this migration is source-only on the current feature branch. It
-- has not been applied to staging or production.

GRANT UPDATE (output_language) ON public.user_settings TO authenticated;
