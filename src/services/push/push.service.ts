import { supabase } from '@/lib/supabase/client';

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export const pushApi = {
  /**
   * Save the browser push subscription for the current user.
   */
  subscribe: async (subscription: PushSubscriptionPayload): Promise<void> => {
    const { error } = await supabase.rpc('rpc_upsert_push_subscription', {
      p_subscription: subscription as unknown as Record<string, unknown>,
    });

    if (error) throw error;
  },

  /**
   * Remove the push subscription for the current user.
   */
  unsubscribe: async (): Promise<void> => {
    const { error } = await supabase.rpc('rpc_delete_push_subscription');

    if (error) throw error;
  },

  /**
   * Check if the current user has an active push subscription.
   */
  isSubscribed: async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('user_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },
};