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
    const MAX_ATTEMPTS = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });
      } catch (networkErr) {
        if (attempt === MAX_ATTEMPTS) {
          throw networkErr instanceof Error
            ? networkErr
            : new Error('Network error while saving push subscription');
        }
        lastError = new Error('Network error while saving push subscription');
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }

      if (response.ok) return;

      const body = await response.json().catch(() => null);
      const errorMsg = body?.error || body?.details || 'Failed to save push subscription';
      console.error(
        `[Push API] Subscribe failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        response.status,
        errorMsg,
        'subscription keys:',
        !!subscription.keys,
      );

      // 4xx errors (validation, auth) are not transient - do not retry them.
      if (response.status < 500 || attempt === MAX_ATTEMPTS) {
        throw new Error(errorMsg);
      }

      lastError = new Error(errorMsg);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }

    throw lastError ?? new Error('Failed to save push subscription');
  },
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
