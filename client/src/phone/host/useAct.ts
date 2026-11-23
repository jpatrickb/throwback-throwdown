import { useCallback } from 'react';
import type { HostAction } from '../../../../shared/types.ts';
import { hostAction } from '../emit.ts';
import { useToast } from '../Toast.tsx';

/** Fire a host action; errors become a toast. Resolves true on success. */
export function useAct() {
  const toast = useToast();
  return useCallback(
    async (a: HostAction) => {
      const r = await hostAction(a);
      if (!r.ok) toast(r.error);
      return r.ok;
    },
    [toast],
  );
}
