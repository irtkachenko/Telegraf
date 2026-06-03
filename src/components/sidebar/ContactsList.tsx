'use client';

import { Loader2, User as UserIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useSearchUsers } from '@/hooks/contacts';
import { ContactItem } from './ContactItem';

interface ContactsListProps {
  query: string;
}

function ContactsListBase({ query }: ContactsListProps) {
  const { data: users, isLoading } = useSearchUsers(query);
  // const { onlineUsers } = usePresence(); // REMOVED

  // Стан для відстеження чи створюється зараз якийсь чат
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Шукаємо...
      </div>
    );
  }

  if (query && query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <UserIcon className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500">Введіть email адресу для пошуку</p>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <UserIcon className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-sm text-gray-500">
          {query ? 'Нічого не знайдено' : 'Введіть email адресу для пошуку'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto sidebar-no-scrollbar px-2 space-y-1">
      <div className="px-4 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Контакти</h2>
      </div>
      {users.map((user) => (
        <ContactItem
          key={user.id}
          user={user}
          disabled={isCreatingChat}
          onActionStart={() => setIsCreatingChat(true)}
          onActionEnd={() => setIsCreatingChat(false)}
        />
      ))}
    </div>
  );
}

export const ContactsList = memo(ContactsListBase);
