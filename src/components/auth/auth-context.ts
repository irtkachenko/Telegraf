'use client';

import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';
import type { AppUser } from '@/types';

export interface AuthContextType {
  user: AppUser | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  supabase: SupabaseClient;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  supabaseUser: null,
  loading: true,
  supabase: {} as SupabaseClient,
  refreshUser: async () => {},
});

export const useSupabaseAuth = () => useContext(AuthContext);
