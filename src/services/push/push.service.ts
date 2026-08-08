export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type CheckSubscriptionResult = {
  subscribed: boolean;
  matchedEndpoint: boolean;
};

export const pushApi = {
  /**
   * Save the browser push subscription for the current user.
   */
  subscribe: async (subscription: PushSubscriptionPayload): Promise<void> => {
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const errorMsg = body?.error || body?.details || 'Failed to save push subscription';
      console.error(
        '[Push API] Subscribe failed:',
        response.status,
        errorMsg,
        'subscription keys:',
        !!subscription.keys,
      );
      throw new Error(errorMsg);
    }
  },

  /**
   * Remove the push subscription for the current user (optionally filtered by endpoint).
   */
  unsubscribe: async (endpoint?: string): Promise<void> => {
    const url = endpoint
      ? `/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`
      : '/api/push/subscribe';
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete push subscription');
    }
  },

  /**
   * Check if the current user has an active push subscription.
   * If endpoint is provided, also checks if this specific endpoint is registered in DB.
   */
  isSubscribed: async (endpoint?: string): Promise<CheckSubscriptionResult> => {
    const url = endpoint
      ? `/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`
      : '/api/push/subscribe';
    const response = await fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Failed to check push subscription');
    }

    const body = (await response.json()) as { subscribed?: boolean; matchedEndpoint?: boolean };
    return {
      subscribed: body.subscribed === true,
      matchedEndpoint: body.matchedEndpoint === true,
    };
  },
};
