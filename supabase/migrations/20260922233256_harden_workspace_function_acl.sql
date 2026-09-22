REVOKE ALL ON FUNCTION public.start_workspace_thread_generation(uuid, uuid, uuid, uuid, uuid, uuid, text),
  public.complete_workspace_thread_generation(uuid, uuid, uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_workspace_thread_generation(uuid, uuid, uuid, uuid, uuid, uuid, text),
  public.complete_workspace_thread_generation(uuid, uuid, uuid, uuid, text, text)
TO service_role;

REVOKE ALL ON FUNCTION private.capture_workspace_version_text(),
  private.restore_workspace_state_text()
FROM PUBLIC, anon, authenticated, service_role;
