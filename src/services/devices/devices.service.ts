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
  /** Signal identity public key (base64 X25519). */
  identity_key?: string | null;
  /** Signal registration id. */
  registration_id?: number | null;
  /** Id of the signed pre key. */
  signed_pre_key_id?: number | null;
  /** Signed pre key public key (base64). */
  signed_pre_key?: string | null;
  /** Signature of the signed pre key (base64). */
  signed_pre_key_signature?: string | null;
  /** Number of unconsumed one-time pre keys on the server. */
  one_time_pre_key_count?: number | null;
}

const DEVICE_SELECT =
  'id, user_id, public_key_jwk, name, created_at, last_seen_at, identity_key, registration_id, signed_pre_key_id, signed_pre_key, signed_pre_key_signature, one_time_pre_key_count';

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
