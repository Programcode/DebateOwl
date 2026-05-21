-- Persist source folders and separate AI output language.

alter table public.sources
  add column if not exists folder text not null default 'General';

update public.sources
set folder = 'General'
where folder is null or btrim(folder) = '';

alter table public.user_settings
  add column if not exists output_language text not null default 'en';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_output_language_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_output_language_check
      check (output_language in ('en', 'es', 'hu'));
  end if;
end $$;
