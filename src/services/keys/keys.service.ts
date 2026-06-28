import { supabase } from '@/lib/supabase/client';

export const keysApi = {
  /**
   * Зберегти або оновити публічний ключ поточного користувача.
   * Викликається після генерації нової ключової пари.
   */
  upsertPublicKey: async (publicKeyJwk: JsonWebKey): Promise<void> => {
    const { error } = await supabase.rpc('rpc_upsert_public_key', {
      p_public_key_jwk: JSON.parse(JSON.stringify(publicKeyJwk)),
    });

    if (error) throw error;
  },

  /**
   * Отримати публічний ключ користувача за його ID.
   * Повертає JWK об'єкт або null, якщо ключ не знайдено.
   */
  getPublicKey: async (userId: string): Promise<JsonWebKey | null> => {
    const { data, error } = await supabase.rpc('rpc_get_public_key', {
      p_user_id: userId,
    });

    if (error) throw error;
    return data as JsonWebKey | null;
  },

  /**
   * Перевірити, чи існує публічний ключ у поточного користувача.
   */
  hasPublicKey: async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('public_keys')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },
};
