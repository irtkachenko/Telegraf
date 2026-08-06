import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { AppUser } from '@/types';

export const contactsApi = {
  /**
   * Search users (contacts)
   */
  searchUsers: async (currentUserId: string, queryText: string) => {
    if (!currentUserId || queryText.trim().length < 2) {
      return [];
    }
    // NOTE: Do NOT escape ILIKE special characters here.
    // The database function search_users() already escapes them correctly.
    // Double-escaping would break searches for emails containing _ or %
    // (e.g. john_doe@gmail.com).
    const safeQuery = queryText.trim().slice(0, 100);

    const { data, error } = await supabase.rpc('search_users', {
      p_query: safeQuery,
    });

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'contacts',
        'CONTACTS_SEARCH_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'ContactsApi.searchUsers');
      throw networkError;
    }

    return data as AppUser[];
  },
};
