'use client';

import React from 'react';
import { SessionExpireDialogContainer as SessionExpireDialogContainerBase } from '@uhg-optum-coreplatform/saas-session-handler-pkg';
import { usePathname, useRouter } from 'next/navigation';

import { BASE_PATH, withBasePath } from '../../utils/base-path';

// Package ships types built against a different @types/react version; re-type to a valid JSX component.
const SessionExpireDialogContainer =
  SessionExpireDialogContainerBase as React.ComponentType<{
    idleSessionTimeout: number;
    idleCountdownMinutes: number;
    logoutUser: () => void;
    handleRefreshSession: () => Promise<void>;
  }>;

const TimeoutPopup = () => {
  const pathName = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  const refreshToken = React.useCallback(async () => {
    try {
      await fetch(`${BASE_PATH}/api/user`);
    } catch (error) {
      console.error('Error refreshing token', error);
      router.push(withBasePath('/logout'));
    }
  }, [router]);

  const logoutUser = () => {
    setOpen(false);
    router.push(withBasePath('/logout'));
  };

  return (
    !pathName?.includes('login') && (
      <div>
        {open && (
          <SessionExpireDialogContainer
            idleSessionTimeout={1680000}
            idleCountdownMinutes={1}
            logoutUser={logoutUser}
            handleRefreshSession={refreshToken}
          />
        )}
      </div>
    )
  );
};

export default TimeoutPopup;
