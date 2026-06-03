import { toast } from 'sonner';
import { shouldSuppressError } from '@/config/error-suppression.config';
import type { AppError } from './errors';
import { createErrorFromStatus, isAppError } from './errors';

export function handleError(
  error: unknown,
  context?: string,
  config: { enableToast?: boolean; enableConsoleLog?: boolean } = {},
): AppError {
  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof Error) {
    appError = createErrorFromStatus(500, error.message, 'UNKNOWN_ERROR');
  } else {
    appError = createErrorFromStatus(500, String(error), 'UNKNOWN_ERROR');
  }

  const isSuppressed = shouldSuppressError(appError, context);

  const showConsole =
    config.enableConsoleLog ?? (process.env.NODE_ENV === 'development' && !isSuppressed);
  const showToast = config.enableToast ?? !isSuppressed;

  if (context) {
    appError.message = `[${context}] ${appError.message}`;
  }

  if (showConsole) {
    console.group(`Error: ${appError.name} [${appError.code}]`);
    console.error(appError);
    console.groupEnd();
  }

  if (showToast) {
    toast.error(getToastTitle(appError), {
      description: appError.isOperational
        ? appError.message
        : 'An unexpected error occurred. Please try again.',
    });
  }

  return appError;
}

function getToastTitle(error: AppError): string {
  switch (error.constructor.name) {
    case 'AuthError':
      return 'Authorization error';
    case 'PermissionError':
      return 'Access denied';
    case 'ValidationError':
      return 'Validation error';
    case 'NetworkError':
      return 'Network error';
    case 'NotFoundError':
      return 'Not found';
    case 'DatabaseError':
      return 'Database error';
    case 'ConfigError':
      return 'Configuration error';
    default:
      return 'Error';
  }
}

export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context?: string,
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  };
}

export function createQueryErrorHandler(context?: string) {
  return (error: unknown) => {
    handleError(error, context);
  };
}

export function shouldRetry(error: unknown): boolean {
  if (!isAppError(error)) return false;
  return (
    error.constructor.name === 'NetworkError' || (error.status !== undefined && error.status >= 500)
  );
}

export function getRetryDelay(attemptNumber: number, error: unknown): number {
  if (!shouldRetry(error)) return 0;
  const delay = Math.min(1000 * 2 ** (attemptNumber - 1), 30000);
  return delay + Math.random() * 1000;
}
