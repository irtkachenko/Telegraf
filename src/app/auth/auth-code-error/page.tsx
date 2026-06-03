'use client';

import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20">
            <AlertTriangle className="h-12 w-12 text-red-400" />
          </div>
        </div>

        {/* Error Content */}
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Помилка авторизації</h1>

          <p className="text-gray-400 leading-relaxed">
            На жаль, сталася помилка під час входу через OAuth. Можливо, термін дії посилання минув
            або виникли проблеми з сервером.
          </p>

          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 text-left">
            <h3 className="font-medium text-red-400 mb-2">Що можна спробувати:</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Спробуйте увійти знову</li>
              <li>• Перевірте з’єднання з інтернетом</li>
              <li>• Очистіть cookies браузера</li>
              <li>• Якщо проблема повторюється, зверніться до підтримки</li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/auth">
              <RefreshCw className="mr-2 h-4 w-4" />
              Спробувати знову
            </Link>
          </Button>

          <Button variant="outline" asChild className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              На головну
            </Link>
          </Button>
        </div>

        {/* Additional Info */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Якщо проблема продовжується, будь ласка, зв’яжіться з нашою командою підтримки.
          </p>
        </div>
      </div>
    </div>
  );
}
