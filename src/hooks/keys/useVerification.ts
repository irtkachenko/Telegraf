'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { keysApi } from '@/services';
import {
  fingerprintOfPublicKey,
  getVerification,
  markVerified,
  storeFingerprint,
} from '@/lib/verification';

export interface VerificationStatus {
  fingerprint: string;
  verified: boolean;
  keyChanged: boolean;
}

/**
 * Resolves and caches the verification status (fingerprint + verified flag) for
 * the recipient in a chat. On first sight it records the fingerprint (TOFU).
 * If a previously verified key changes, `keyChanged` becomes true — the UI must
 * block sending to protect against a possible key-substitution (MITM) attack.
 */
export function useVerification(
  chatId: string | undefined,
  recipientId: string | undefined,
) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['e2ee-verify', chatId, user?.id, recipientId],
    queryFn: async (): Promise<VerificationStatus | null> => {
      if (!user || !recipientId) return null;

      const recipientJwk = await keysApi.getPublicKey(recipientId);
      if (!recipientJwk) return null;

      const fingerprint = await fingerprintOfPublicKey(recipientJwk);
      const stored = await getVerification(user.id, recipientId);

      if (!stored) {
        // TOFU: record the first-seen fingerprint.
        await storeFingerprint(user.id, recipientId, fingerprint);
        return { fingerprint, verified: false, keyChanged: false };
      }

      return {
        fingerprint: stored.fingerprint,
        verified: stored.verified,
        keyChanged: stored.fingerprint !== fingerprint,
      };
    },
    enabled: !!user?.id && !!chatId && !!recipientId,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
    retry: 1,
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !recipientId) return;
      await markVerified(user.id, recipientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['e2ee-verify', chatId, user?.id, recipientId],
      });
    },
  });

  const confirm = () => {
    void verifyMutation.mutateAsync();
  };

  return {
    status: data ?? null,
    isLoading,
    isConfirming: verifyMutation.isPending,
    confirm,
  };
}
