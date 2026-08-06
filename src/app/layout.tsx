import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Tektur, Chakra_Petch } from 'next/font/google';
import AuthProvider from '@/components/auth/AuthProvider';
import ChatLayoutWrapper from '@/components/layout/ChatLayoutWrapper';
import GlobalCleanup from '@/components/layout/GlobalCleanup';
import PwaRegister from '@/components/layout/PwaRegister';
import Providers from '@/components/Providers';
import UpdateChecker from '@/components/UpdateChecker';
import Sidebar from '@/components/sidebar/Sidebar';
import { createClient } from '@/lib/supabase/server';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const tektur = Tektur({
  variable: '--font-tektur',
  subsets: ['latin', 'cyrillic'],
});

const chakraPetch = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
  variable: '--font-chakra',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Telegraf',
  description: 'A modern messaging app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Telegraf',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/ios/180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${tektur.variable} ${chakraPetch.variable} antialiased bg-red-600 text-white`}
        suppressHydrationWarning
      >
        <PwaRegister />
        <UpdateChecker>
          <Providers>
            <AuthProvider>
              <GlobalCleanup>
                <ChatLayoutWrapper
                  user={
                    user
                      ? {
                          id: user.id,
                          email: user.email,
                          name:
                            user.user_metadata.full_name ||
                            user.user_metadata.name ||
                            user.email?.split('@')[0],
                          image: user.user_metadata.avatar_url || user.user_metadata.picture,
                        }
                      : null
                  }
                  sidebar={user ? <Sidebar /> : null}
                >
                  {children}
                </ChatLayoutWrapper>
              </GlobalCleanup>
            </AuthProvider>
          </Providers>
        </UpdateChecker>
      </body>
    </html>
  );
}
