import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

const MESSAGES_SELECT = `
  *,
  sender:sender_id(id, name, image),
  reply_to:reply_to_id(
    *,
    sender:sender_id(id, name, image)
  ),
  updated_at
`;

export const messagesApi = {
  /**
   * Fetch chat messages with pagination support
   */
  getMessages: async (chatId: string, cursor?: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGES_SELECT)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(50)
      .lt('created_at', cursor || '9999-12-31');

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'messages',
        'MESSAGES_LOAD_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'MessagesApi.getMessages');
      throw networkError;
    }

    const normalizedData = (data as unknown as Message[]).map((msg) => ({
      ...msg,
      attachments: msg.attachments || [],
    }));

    // Return in reverse order for Virtuoso list
    return normalizedData.reverse();
  },

  /**
   * Send a new message
   */
  sendMessage: async (
    chatId: string,
    payload: {
      sender_id: string;
      content: string;
      reply_to_id?: string;
      attachments?: Attachment[];
      client_id?: string;
    },
  ) => {
    const { data, error } = await supabase.rpc('rpc_send_message', {
      p_chat_id: chatId,
      p_content: payload.content,
      p_reply_to_id: payload.reply_to_id || null,
      p_attachments: payload.attachments || [],
      p_client_id: payload.client_id || null,
    });

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'messages',
        'MESSAGE_SEND_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'MessagesApi.sendMessage');
      throw networkError;
    }

    // Return raw RPC result. The realtime INSERT event handler in useChatsRealtime
    // will hydrate reply_to and sender fields when it processes the event,
    // eliminating the need for an extra getMessage call here.
    return {
      ...(data as Message),
      attachments: (data as Message).attachments || [],
    };
  },

  /**
   * Delete a message
   */
  deleteMessage: async (messageId: string) => {
    const { data, error } = await supabase.rpc('rpc_delete_message', {
      p_message_id: messageId,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Get a single message by ID with reply details
   */
  getMessage: async (messageId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGES_SELECT)
      .eq('id', messageId)
      .single();

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'messages',
        'MESSAGE_GET_ERROR',
        error.status || 404,
      );
      handleError(networkError, 'MessagesApi.getMessage');
      throw networkError;
    }

    const normalizedData = {
      ...data,
      attachments: data.attachments || [],
    } as Message;

    return normalizedData;
  },

  /**
   * Edit an existing message
   */
  editMessage: async (messageId: string, content: string) => {
    const { data, error } = await supabase.rpc('rpc_edit_message', {
      p_message_id: messageId,
      p_content: content,
    });
    if (error) throw error;
    return data;
  },
};
