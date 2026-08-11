import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';

export interface DeviceRow {
  id: string;
  user_id: string;
  public_key_jwk: JsonWebKey;
  name: string | null;
  created_at: string;
  last_seen_at: string;
}

const DEVICE_SELECT = 'id, user_id, public_key_jwk, name, created_at, last_seen_at';

export const devicesApi = {
  /**
   * Усі пристрої користувача (для поточного юзера — керування;
   * для іншого — лише публічні ключі, щоб шифрувати для кожного).
   */
  listDevices: async (userId: string): Promise<DeviceRow[]> => {
    const { data, error } = await supabase
      .from('devices')
      .select(DEVICE_SELECT)
      .eq('user_id', userId);

    if (error) {
      handleError(
        new NetworkError(error.message, 'devices', 'DEVICES_LOAD_ERROR', error.status || 500),
        'DevicesApi.listDevices',
      );
      throw error;
    }
    return (data as DeviceRow[]) || [];
  },

  /**
   * Зареєструвати поточний пристрій (вставити рядок із публічним ключем).
   * `userId` обов'язковий: RLS вимагає user_id = auth.uid().
   */
  registerDevice: async (
    userId: string,
    publicKeyJwk: JsonWebKey,
    name?: string,
  ): Promise<DeviceRow> => {
    const { data, error } = await supabase
      .from('devices')
      .insert({ user_id: userId, public_key_jwk: publicKeyJwk, name: name || null })
      .select(DEVICE_SELECT)
      .single();

    if (error) throw error;
    return data as DeviceRow;
  },

  /**
   * Відв'язати пристрій (тільки власний за RLS).
   */
  removeDevice: async (deviceId: string): Promise<void> => {
    const { error } = await supabase.from('devices').delete().eq('id', deviceId);
    if (error) throw error;
  },
};
