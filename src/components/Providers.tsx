'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ProfilerOnRenderCallback } from 'react';
import { lazy, Profiler, Suspense, useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { queryClient } from '@/lib/query-client';

function RenderGuard({ children }: { children: React.ReactNode }) {
  const commitCount = useRef(0);
  const lastResetTime = useRef(0);
  const lastWarnTime = useRef(0);
  const isDev = process.env.NODE_ENV === 'development';
  const isGuardEnabled = isDev;

  useEffect(() => {
    if (!isGuardEnabled) return;
    lastResetTime.current = Date.now();
  }, [isGuardEnabled]);

  if (!isGuardEnabled) {
    return <>{children}</>;
  }

  const handleRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commitCount.current++;
    const now = Date.now();

    if (now - lastResetTime.current >= 1000) {
      if (commitCount.current > 40 && now - lastWarnTime.current > 5000) {
        console.warn(`[RenderGuard] High commit rate detected: ${commitCount.current} commits/sec`);
        lastWarnTime.current = now;
      }
      commitCount.current = 0;
      lastResetTime.current = now;
    }

    if (actualDuration > 150 && now - lastWarnTime.current > 10000) {
      console.warn(`[RenderGuard] Slow commit detected: ${actualDuration.toFixed(0)}ms`);
      lastWarnTime.current = now;
    }
  };

  return (
    <Profiler id="TelegrafMonitor" onRender={handleRender}>
      {children}
    </Profiler>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const ReactQueryDevtools =
    process.env.NODE_ENV === 'development'
      ? lazy(async () => {
          const mod = await import('@tanstack/react-query-devtools');
          return { default: mod.ReactQueryDevtools };
        })
      : null;

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <RenderGuard>{children}</RenderGuard>
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand={true}
          visibleToasts={3}
          toastOptions={{
            style: { zIndex: 9999 },
          }}
        />
      </GlobalErrorBoundary>
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
