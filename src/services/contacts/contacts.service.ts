import { sanitizeSearchQuery } from '@/lib/sanitize';
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
    const safeQuery = sanitizeSearchQuery(queryText, 100);

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
