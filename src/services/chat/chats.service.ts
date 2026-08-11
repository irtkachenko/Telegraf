import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { FullChat } from '@/types';

export const chatsApi = {
  /**
   * Get chat list for current user with pagination
   */
  getChats: async (userId: string, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('chats')
      .select(`
        *,
        user:user_id(*),      
        recipient:recipient_id(*),
        messages!messages_chat_id_chats_id_fk(
          id, 
          content, 
          created_at, 
          sender_id, 
          chat_id, 
                    attachments,
          encrypted_content,
          encrypted_iv
        )
      `)
      .or(`user_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { foreignTable: 'messages', ascending: false })
      .limit(1, { foreignTable: 'messages' })
      .range(offset, offset + limit - 1);

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'chats',
        'CHATS_LOAD_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'ChatsApi.getChats');
      throw networkError;
    }

    return data as FullChat[];
  },

  /**
   * Get chats for infinite query
   */
  getChatsInfinite: async (userId: string, pageParam = 1, limit = 20) => {
    return chatsApi.getChats(userId, pageParam, limit);
  },

  /**
   * Get a single chat with related users and latest message.
   */
  getChatById: async (chatId: string) => {
    const { data, error } = await supabase
      .from('chats')
      .select(
        `
        *,
        user:user_id(*),
        recipient:recipient_id(*),
        messages!messages_chat_id_chats_id_fk(
          id,
          content,
          created_at,
          sender_id,
                    chat_id,
          attachments,
          encrypted_content,
          encrypted_iv
        )
      `,
      )
      .eq('id', chatId)
      .order('created_at', { foreignTable: 'messages', ascending: false })
      .limit(1, { foreignTable: 'messages' })
      .maybeSingle();

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'chats',
        'CHAT_LOAD_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'ChatsApi.getChatById');
      throw networkError;
    }

    return data as FullChat | null;
  },

  /**
   * Create new chat
   */
  createChat: async (payload: { recipient_id: string }) => {
    const { data, error } = await supabase.rpc('rpc_create_chat', {
      p_recipient_id: payload.recipient_id,
    });

    if (error) throw error;
    const { data: fullChat, error: fetchError } = await supabase
      .from('chats')
      .select(
        `
        *,
        user:user_id(*),      
        recipient:recipient_id(*)
      `,
      )
      .eq('id', (data as FullChat).id)
      .single();

    if (fetchError) throw fetchError;
    return fullChat as FullChat;
  },

  /**
   * Delete chat
   */
  deleteChat: async (chatId: string) => {
    const { error } = await supabase.from('chats').delete().eq('id', chatId);
    if (error) throw error;
    return chatId;
  },

  /**
   * Update chat
   */
  updateChat: async (
    chatId: string,
    payload: Partial<{
      title: string;
      updated_at: string;
    }>,
  ) => {
    const { data, error } = await supabase
      .from('chats')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', chatId)
      .select()
      .single();

    if (error) throw error;
    return data as FullChat;
  },
};
