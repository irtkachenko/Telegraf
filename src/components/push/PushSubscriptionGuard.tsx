'use client';

/**
 * PushSubscriptionGuard previously rendered a full-screen blocking modal
 * asking for notification permissions on every login/page load.
 *
 * This caused issues where:
 * 1. The permission prompt flashed and disappeared instantly.
 * 2. It broke direct navigation to chats when opening push notifications.
 *
 * We now render nothing (null). Push notifications can be toggled voluntarily
 * by the user via the Navbar bell icon or landing page button.
 */
export default function PushSubscriptionGuard() {
  return null;
}
