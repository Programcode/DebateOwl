-- The 20260819 hardening re-granted client-editable settings columns but left
-- out output_language, so saving the AI output language was always denied.
GRANT UPDATE (output_language) ON public.user_settings TO authenticated;
