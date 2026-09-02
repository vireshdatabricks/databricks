import React from 'react';
import {cookies} from 'next/headers';

import TemplateClient from './components/template-client';
import {isAuthDisabled} from './utils/auth';

const Template = async ({children}: {children: React.ReactNode}) => {
  const cookieStore = await cookies();
  const authDisabled = isAuthDisabled();
  const sessionId = cookieStore.get('sessionId')?.value;
  const hasSession = authDisabled || Boolean(sessionId);

  return (
    <TemplateClient hasSession={hasSession} authDisabled={authDisabled}>
      {children}
    </TemplateClient>
  );
};

export default Template;
