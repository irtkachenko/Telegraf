'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { handleError } from '@/shared/lib/error-handler';
import { createErrorFromStatus, isAppError } from '@/shared/lib/errors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    handleError(error, 'GlobalErrorBoundary');

    if (process.env.NODE_ENV === 'development') {
      console.group('React Error Info');
      console.error(errorInfo);
      console.groupEnd();
    }
  }

  public render() {
    if (this.state.hasError && this.state.error) {
      const appError = isAppError(this.state.error)
        ? this.state.error
        : createErrorFromStatus(500, this.state.error.message, 'UNKNOWN_ERROR');

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="p-4 rounded-full bg-red-500/10 text-red-500">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {appError.isCritical ? 'Критична помилка' : 'Щось пішло не так'}
            </h2>
            <p className="text-zinc-400">
              {appError.isOperational
                ? appError.message
                : 'Сталася неочікувана помилка. Наша команда вже сповіщена.'}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details className="text-left text-zinc-500 text-sm mt-4">
                <summary className="cursor-pointer hover:text-zinc-400">
                  Деталі помилки (dev)
                </summary>
                <pre className="mt-2 p-2 bg-zinc-900 rounded overflow-auto">
                  {JSON.stringify(appError.toJSON(), null, 2)}
                </pre>
              </details>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                <RotateCcw size={16} />
                Перезавантажити
              </Button>
              <Button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="gap-2 bg-white text-black hover:bg-zinc-200"
              >
                Спробувати знову
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
