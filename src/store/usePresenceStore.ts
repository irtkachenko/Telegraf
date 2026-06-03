/* eslint-disable react-compiler/react-compiler */
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useCallback } from 'react';
import { create } from 'zustand';
import {
  getHeartbeatInterval,
  getInactivityTimeout,
  getMaxReconnectAttempts,
  getPresenceDebounceDelay,
  getReconnectDelay,
} from '@/config/presence.config';
import { supabase } from '@/lib/supabase/client';

interface PresenceState {
  onlineUsers: Set<string>;
  setOnlineUsers: (users: Set<string>) => void;
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void;
}

interface PresenceManager {
  channel: RealtimeChannel | null;
  userId: string | null;
  subscribers: number;
  heartbeatInterval: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  debounceTimer: NodeJS.Timeout | null;
  pendingUsers: Set<string>;
  lastActivity: number;
  cleanupTimeout: NodeJS.Timeout | null;
}

const MAX_RECONNECT_ATTEMPTS = getMaxReconnectAttempts();
const RECONNECT_DELAY = getReconnectDelay();
const HEARTBEAT_INTERVAL = getHeartbeatInterval();
const PRESENCE_DEBOUNCE_DELAY = getPresenceDebounceDelay();
const INACTIVITY_TIMEOUT = getInactivityTimeout();
const MIN_LAST_SEEN_UPDATE_INTERVAL = 15000;
const LAST_SEEN_TS_STORAGE_KEY = 'telegraf:last-seen-updated-at';

function createPresenceManager(): PresenceManager {
  return {
    channel: null,
    userId: null,
    subscribers: 0,
    heartbeatInterval: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    debounceTimer: null,
    pendingUsers: new Set(),
    lastActivity: Date.now(),
    cleanupTimeout: null,
  };
}

async function updateLastSeen(): Promise<void> {
  const now = Date.now();
  if (typeof window !== 'undefined') {
    try {
      const rawLast = window.sessionStorage.getItem(LAST_SEEN_TS_STORAGE_KEY);
      const last = rawLast ? Number(rawLast) : 0;

      if (Number.isFinite(last) && now - last < MIN_LAST_SEEN_UPDATE_INTERVAL) return;
      window.sessionStorage.setItem(LAST_SEEN_TS_STORAGE_KEY, String(now));
    } catch {
      // Ignore storage errors and continue with update.
    }
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/update_last_seen`;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Use fetch with keepalive for highest reliability on page leave
  if (typeof window !== 'undefined' && anonKey) {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      void fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({}),
        keepalive: true,
      });
      return;
    } catch {
      // Fallback below
    }
  }

  // Fallback to standard RPC
  try {
    const { error } = await supabase.rpc('update_last_seen');
    if (error && process.env.NODE_ENV === 'development') {
      console.warn('Failed to update last seen:', error.message);
    }
  } catch {
    // Silently fail
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    void updateLastSeen();
  }
}

function handleBeforeUnload(): void {
  void updateLastSeen();
}

function handlePageHide(): void {
  void updateLastSeen();
}

function updateActivity(manager: PresenceManager): void {
  manager.lastActivity = Date.now();

  // Clear existing cleanup timeout
  if (manager.cleanupTimeout) {
    clearTimeout(manager.cleanupTimeout);
  }

  // Set new cleanup timeout
  manager.cleanupTimeout = setTimeout(() => {
    // Check if manager is still inactive and has no subscribers
    if (
      presenceSingleton.manager &&
      presenceSingleton.manager.userId === manager.userId &&
      presenceSingleton.manager.subscribers <= 0 &&
      Date.now() - presenceSingleton.manager.lastActivity >= INACTIVITY_TIMEOUT
    ) {
      cleanupPresence();
    }
  }, INACTIVITY_TIMEOUT);
}

function startHeartbeat(manager: PresenceManager): void {
  if (manager.heartbeatInterval) {
    clearInterval(manager.heartbeatInterval);
  }
  manager.heartbeatInterval = setInterval(() => {
    if (manager.channel && manager.userId) {
      updateActivity(manager);
      manager.channel.track({
        user_id: manager.userId,
        online_at: new Date().toISOString(),
      });
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(manager: PresenceManager): void {
  if (manager.heartbeatInterval) {
    clearInterval(manager.heartbeatInterval);
    manager.heartbeatInterval = null;
  }
}

function debouncedPresenceUpdate(
  manager: PresenceManager,
  setOnlineUsers: (users: Set<string>) => void,
  onlineIds: Set<string>,
): void {
  if (manager.debounceTimer) {
    clearTimeout(manager.debounceTimer);
  }
  manager.debounceTimer = setTimeout(() => {
    setOnlineUsers(onlineIds);
    manager.debounceTimer = null;
  }, PRESENCE_DEBOUNCE_DELAY);
}

function setupChannel(
  manager: PresenceManager,
  userId: string,
  setOnlineUsers: (users: Set<string>) => void,
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void,
): void {
  // Update activity when setting up channel
  updateActivity(manager);

  // Cancel any pending reconnect attempt before creating a new channel
  if (manager.reconnectTimer) {
    clearTimeout(manager.reconnectTimer);
    manager.reconnectTimer = null;
  }

  // Remove existing channel before creating new one to prevent memory leaks
  if (manager.channel) {
    supabase.removeChannel(manager.channel);
  }

  manager.channel = supabase.channel('db-global-updates', {
    config: { presence: { key: userId } },
  });

  if (manager.channel) {
    manager.channel
      .on('presence', { event: 'sync' }, () => {
        if (manager.channel) {
          const state = manager.channel.presenceState();
          const onlineIds = new Set<string>();
          for (const key of Object.keys(state)) {
            onlineIds.add(key);
          }
          debouncedPresenceUpdate(manager, setOnlineUsers, onlineIds);
        }
      })
      .subscribe(async (status: string) => {
        switch (status) {
          case 'SUBSCRIBED':
            setConnectionState('CONNECTED');
            manager.reconnectAttempts = 0;
            if (manager.channel) {
              await manager.channel.track({
                user_id: userId,
                online_at: new Date().toISOString(),
              });
            }
            startHeartbeat(manager);
            break;

          case 'CLOSED':
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setConnectionState('DISCONNECTED');
            await updateLastSeen();
            stopHeartbeat(manager);

            // Attempt reconnection if we haven't exceeded max attempts
            if (
              manager.reconnectAttempts < manager.maxReconnectAttempts &&
              manager.subscribers > 0
            ) {
              manager.reconnectAttempts++;
              setConnectionState('RECONNECTING');

              // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
              // Plus Jitter (±20%) to prevent "Thundering Herd"
              const baseDelay = RECONNECT_DELAY * 2 ** (manager.reconnectAttempts - 1);
              const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
              const delay = Math.max(0, baseDelay + jitter);

              manager.reconnectTimer = setTimeout(() => {
                if (manager.channel && manager.subscribers > 0) {
                  setupChannel(manager, userId, setOnlineUsers, setConnectionState);
                }
                manager.reconnectTimer = null;
              }, delay);
            }
            break;
        }
      });
  }
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set(),
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  connectionState: 'DISCONNECTED',
  setConnectionState: (state) => set({ connectionState: state }),
}));

// Optimized selectors to prevent unnecessary re-renders
export const useOnlineUsers = () => usePresenceStore((state) => state.onlineUsers);
export const useConnectionState = () => usePresenceStore((state) => state.connectionState);
export const useIsUserOnline = (userId: string) =>
  usePresenceStore((state) => state.onlineUsers.has(userId));
export const useOnlineUserCount = () => usePresenceStore((state) => state.onlineUsers.size);

export function usePresence() {
  const onlineUsers = useOnlineUsers();
  return { onlineUsers };
}

// Global manager instance to ensure only one connection exists
const presenceSingleton: { manager: PresenceManager | null } = { manager: null };

function getOrCreateManager(
  userId: string,
  setOnlineUsers: (users: Set<string>) => void,
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void,
): PresenceManager {
  if (presenceSingleton.manager && presenceSingleton.manager.userId === userId) {
    updateActivity(presenceSingleton.manager);
    return presenceSingleton.manager;
  }

  // If user changed, cleanup old manager
  if (presenceSingleton.manager) {
    cleanupPresence();
  }

  const manager = createPresenceManager();
  manager.userId = userId;
  setupChannel(manager, userId, setOnlineUsers, setConnectionState);
  presenceSingleton.manager = manager;

  // Add global event listeners
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handlePageHide);

  return manager;
}

export function usePresenceSubscription() {
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);
  const setConnectionState = usePresenceStore((state) => state.setConnectionState);

  const subscribe = useCallback(
    (user: User | null) => {
      if (!user?.id) return;

      const manager = getOrCreateManager(user.id, setOnlineUsers, setConnectionState);
      manager.subscribers++;
      updateActivity(manager);
    },
    [setOnlineUsers, setConnectionState],
  );

  const unsubscribe = useCallback(() => {
    if (!presenceSingleton.manager) return;

    presenceSingleton.manager.subscribers--;

    // Cleanup when no more subscribers
    if (presenceSingleton.manager.subscribers <= 0) {
      cleanupPresence();
    }
  }, []);

  const getConnectionState = useCallback(() => {
    return usePresenceStore.getState().connectionState;
  }, []);

  return {
    subscribe,
    unsubscribe,
    getConnectionState,
  };
}

function cleanupPresence(): void {
  const manager = presenceSingleton.manager;
  if (!manager) return;

  // Clear debounce timer
  if (manager.debounceTimer) {
    clearTimeout(manager.debounceTimer);
    manager.debounceTimer = null;
  }

  // Clear cleanup timeout
  if (manager.cleanupTimeout) {
    clearTimeout(manager.cleanupTimeout);
    manager.cleanupTimeout = null;
  }

  // Clear pending reconnect timeout
  if (manager.reconnectTimer) {
    clearTimeout(manager.reconnectTimer);
    manager.reconnectTimer = null;
  }

  // Update last seen before disconnecting
  void updateLastSeen();

  // Stop heartbeat
  stopHeartbeat(manager);

  // Remove channel
  if (manager.channel) {
    supabase.removeChannel(manager.channel);
    manager.channel = null;
  }

  // Remove global event listeners
  window.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('pagehide', handlePageHide);

  // Reset global state
  presenceSingleton.manager = null;

  // Update store state
  usePresenceStore.getState().setConnectionState('DISCONNECTED');
}

// Export cleanup function for manual cleanup if needed
export { cleanupPresence };
