/**
 * Configuration for error suppression.
 * Defines which errors should be "silent" (not shown to user or logged to console).
 */

export interface ErrorSuppressionRule {
  status?: number[];
  codes?: string[];
  patterns?: string[];
  context?: string[];
}

export const ERROR_SUPPRESSION_CONFIG: ErrorSuppressionRule = {
  // HTTP status codes that should be silent
  status: [
    400, // Often used for "Object not found" in storage or simple validation
    401, // Authentication errors - expected when session expires
    404, // Not found is often an expected result
  ],

  // Specific error codes that should be silent
  codes: [
    'SIGNED_URL_ERROR',
    'GET_URL_ERROR',
    'AUTH_ERROR', // Add auth errors
    'INITIAL_USER_ERROR',
    'UPDATE_LAST_SEEN_ERROR',
  ],

  // String patterns in error messages that should trigger suppression
  patterns: [
    'object not found',
    'not found',
    'failed to create signed url',
    'failed to get url',
    'session expired', // Add session expiration
    'session not found',
    'session unavailable',
    'auth session missing',
    'refresh token not found',
    'unauthorized', // Add unauthorized access
    'authentication failed', // Add authentication failures
  ],

  // Contexts where suppression might be applicable
  context: [
    'SupabaseFetch',
    'StorageApi.getUrl',
    'StorageApi.getSignedUrl',
    'AuthProvider',
    'Auth',
    'UpdateLastSeen',
  ],
};

interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * Checks if an error should be suppressed based on the centralized configuration.
 */
export function shouldSuppressError(error: ErrorLike | unknown, context?: string): boolean {
  if (!error) return false;

  const err = error as ErrorLike;
  const status = err.status;
  const code = err.code;
  const message = (err.message || String(error)).toLowerCase();

  // Check status code
  if (status && ERROR_SUPPRESSION_CONFIG.status?.includes(status)) {
    // For 400/401/404, we usually only want to suppress if it's related to storage or specific contexts
    const isStorageContext = context && ERROR_SUPPRESSION_CONFIG.context?.includes(context);
    const hasPathPattern = message.includes('attachments/') || message.includes('storage');
    const isAuthError = status === 401; // 401 errors are often session-related

    if (isStorageContext || hasPathPattern || isAuthError) return true;
  }

  // Check error code
  if (code && ERROR_SUPPRESSION_CONFIG.codes?.includes(code)) return true;

  // Check message patterns
  if (ERROR_SUPPRESSION_CONFIG.patterns?.some((pattern) => message.includes(pattern))) {
    // Only suppress if it's a known non-critical context
    if (context && ERROR_SUPPRESSION_CONFIG.context?.includes(context)) return true;
  }

  return false;
}
