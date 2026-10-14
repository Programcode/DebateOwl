import type { AskOutput } from '@debatelab/core/ai/schemas/ask';

import { debateListScopes } from './debates';
import { afterWrite, cachedRead, pickFailure, readFailed, type CopyMark } from './offline-cache';
import { supabase } from './supabase';

/**
 * Ask conversations in the website's chats and messages tables, written the
 * way its session store records them (syncAskChatNow in
 * src/lib/stores/session-store.ts): a new chat needs a debate, a loaded chat
 * keeps the debate it lives in, and only finished exchanges are saved.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  output?: AskOutput & Record<string, unknown>;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}

/** Where the open conversation is saved. `persisted` counts the messages already written. */
export interface ChatRecord {
  chatId: string | null;
  debateId: string | null;
  persisted: number;
}

/** A failed message write, with the record to keep: the chat may have been created before it failed. */
export class ChatSaveError extends Error {
  constructor(message: string, readonly record: ChatRecord) {
    super(message);
    this.name = 'ChatSaveError';
  }
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  output: unknown;
  created_at: string;
}

/**
 * Every chat read and write below also filters on the user. Row level security
 * is the real boundary; the filter keeps a wrong session from mixing accounts.
 * Messages have no user column and are reached through their chat.
 */

/** Chats in a debate, or the unsorted ones in one-off mode, newest first, as the website's saved chats list. */
export function fetchChats(userId: string, debateId: string | null, mark?: CopyMark): Promise<ChatSummary[]> {
  return cachedRead(userId, 'chats', debateId ?? 'one-off', () => loadChats(userId, debateId), mark);
}

async function loadChats(userId: string, debateId: string | null): Promise<ChatSummary[]> {
  const query = supabase
    .from('chats')
    .select('id,title,created_at,messages(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const { data, error, status } = await (debateId ? query.eq('debate_id', debateId) : query.is('debate_id', null));
  if (error) throw readFailed(error, status);
  return ((data ?? []) as { id: string; title: string; created_at: string; messages: { count: number }[] }[]).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    messageCount: row.messages[0]?.count ?? 0,
  }));
}

export function fetchChat(userId: string, chatId: string, mark?: CopyMark): Promise<{ debateId: string | null; messages: ChatMessage[] }> {
  return cachedRead(userId, 'chat', chatId, () => loadChat(userId, chatId), mark);
}

async function loadChat(userId: string, chatId: string): Promise<{ debateId: string | null; messages: ChatMessage[] }> {
  const [chat, messages] = await Promise.all([
    supabase.from('chats').select('debate_id').eq('user_id', userId).eq('id', chatId).single(),
    supabase.from('messages').select('id,role,content,output,created_at').eq('chat_id', chatId).order('created_at', { ascending: true }),
  ]);
  const failures = [chat, messages].flatMap((result) => (result.error ? [readFailed(result.error, result.status)] : []));
  if (failures.length > 0) throw pickFailure(failures);
  return {
    debateId: (chat.data as { debate_id: string | null }).debate_id ?? null,
    messages: ((messages.data ?? []) as MessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.created_at).getTime(),
      output: row.output && typeof row.output === 'object' ? (row.output as ChatMessage['output']) : undefined,
    })),
  };
}

/**
 * Writes the messages not saved yet, creating the chat first when needed.
 * Returns the record to keep, or null when there is nowhere to save: a new
 * conversation in one-off mode stays unsaved, as on the website.
 */
export async function saveChat(userId: string, record: ChatRecord, messages: ChatMessage[], activeDebateId: string | null): Promise<ChatRecord | null> {
  if (messages.length === 0 || record.persisted >= messages.length) return record;
  let { chatId, debateId } = record;
  if (!chatId) {
    if (!activeDebateId) return null;
    const title = messages.find((message) => message.role === 'user')?.content.slice(0, 60) || 'Chat';
    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: userId, debate_id: activeDebateId, side: 'neutral', title })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not save the chat');
    chatId = (data as { id: string }).id;
    debateId = activeDebateId;
    afterWrite(userId, [{ group: 'chats', key: debateId }, ...debateListScopes(debateId, 'chat')]);
  }
  const pending = messages.slice(record.persisted);
  const { error } = await supabase.from('messages').insert(pending.map((message) => ({
    chat_id: chatId,
    role: message.role,
    content: message.content,
    output: message.output || null,
    created_at: new Date(message.timestamp).toISOString(),
  })));
  // The chat exists now; keep it so the next save adds these messages to it instead of creating another.
  if (error) throw new ChatSaveError(error.message, { chatId, debateId, persisted: record.persisted });
  // The conversation and the message count in its debate's list and in History changed.
  afterWrite(userId, [{ group: 'chat', key: chatId }, { group: 'chats', key: debateId ?? 'one-off' }, { group: 'history', key: debateId ?? 'one-off' }]);
  return { chatId, debateId, persisted: messages.length };
}
