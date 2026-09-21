BEGIN;
SELECT plan(4);

SELECT has_table(
  'private',
  'workspace_document_state',
  'canonical workspace document state is private'
);
SELECT has_table(
  'private',
  'workspace_document_updates',
  'durable workspace updates are private'
);
SELECT has_function(
  'public',
  'create_workspace_document',
  ARRAY['uuid', 'text', 'text', 'uuid', 'bigint', 'uuid'],
  'members create or duplicate files through one transactional RPC'
);
SELECT has_trigger(
  'public',
  'workspace_members',
  'workspace_members_notify_access_revoked_after_delete',
  'member removal notifies the collaboration fence after commit'
);

SELECT * FROM finish();
ROLLBACK;
