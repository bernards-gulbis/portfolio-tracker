import { useEffect } from 'react';

/** Warns the user via the browser's native beforeunload dialog when form state is dirty. */
export const useWarnUnsavedChanges = (isDirty: boolean) => {
  useEffect(() => {
    if (isDirty) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      globalThis.window.addEventListener('beforeunload', handler);
      return () => globalThis.window.removeEventListener('beforeunload', handler);
    }
  }, [isDirty]);
};
