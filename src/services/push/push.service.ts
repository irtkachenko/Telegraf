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
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Failed to save push subscription');
    }
  },

  /**
   * Remove the push subscription for the current user.
   */
  unsubscribe: async (): Promise<void> => {
    const response = await fetch('/api/push/subscribe', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete push subscription');
    }
  },

  /**
   * Check if the current user has an active push subscription.
   */
  isSubscribed: async (): Promise<boolean> => {
    const response = await fetch('/api/push/subscribe', {
      method: 'GET',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Failed to check push subscription');
    }

    const body = (await response.json()) as { subscribed?: boolean };
    return body.subscribed === true;
  },
};
