import type { Database } from './supabase';

export interface UserMetadata {
  name?: string;
  full_name?: string;
  avatar_url?: string;
  picture?: string;
  provider?: string;
}

export interface AppUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  user_metadata: UserMetadata;
  name: string | null;
  image: string | null;
  last_seen: string | null;
  is_online: boolean;
  display_name: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  is_deleted?: boolean;
  metadata: {
    name: string;
    size: number;
    width?: number;
    height?: number;
    expired?: boolean;
    /** Оригінальний MIME-тип файлу (для E2EE-вкладень) */
    type?: string;
    /** Зашифровані метадані (ключ файлу + IV + оригінальна назва/тип) — base64 */
    encrypted_metadata?: string;
    /** IV для розшифрування метаданих — base64 */
    encrypted_metadata_iv?: string;
  };
  uploading?: boolean;
}

export interface OptimisticAttachment extends Attachment {
  file?: File;
  previewUrl: string;
  uploading?: boolean;
  error?: string;
  progress?: number;
}

export type ChatRow = Database['public']['Tables']['chats']['Row'];

/** Ключ повідомлення, обгорнутий для одного пристрою одержувача. */
export interface MessageKeyEntry {
  device_id: string;
  key: string; // base64 (AES-GCM wrapped per-message key)
  iv: string; // base64
}

export type Message = Database['public']['Tables']['messages']['Row'] & {
  attachments: Attachment[] | null;
  /** Пристрій-відправник (devices.id) для багатопристроєвого E2EE. */
  sender_device_id?: string | null;
  /** Публічний ключ пристрою-відправника (JWK). */
  sender_device_public_key?: JsonWebKey | null;
  /** Ключ повідомлення, обгорнутий окремо для кожного пристрою. */
  message_keys?: MessageKeyEntry[] | null;
  reply_details?: {
    id: string;
    sender: { name?: string | null };
    content: string;
    sender_id?: string;
    attachments?: Attachment[];
  } | null;
  reply_to?: Message;
  sender?: AppUser | null;
  user?: {
    id: string;
    name?: string | null;
    image?: string | null;
  } | null;
  is_optimistic?: boolean;
};

export type FullChat = ChatRow & {
  messages: Message[];
  participants: AppUser[];
  recipient?: AppUser | null;
  user?: AppUser | null;
  user_last_read?: { id: string; created_at: string } | null;
  recipient_last_read?: { id: string; created_at: string } | null;
};

export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}
