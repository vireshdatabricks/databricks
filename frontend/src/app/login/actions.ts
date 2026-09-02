'use server';

import type {IdpCLoginProps} from '@uhg-optum-coreplatform/security-as-a-service-pkg';

// eslint-disable-next-line @typescript-eslint/require-await
export async function getMSIDSettings(): Promise<IdpCLoginProps> {
  return {
    clientId: process.env['PING_FED_CLIENT_ID'] || '',
    redirectUri: process.env['REDIRECT_URI'] || '',
    responseType: process.env['RESPONSE_TYPE'],
    scope: process.env['SCOPE'] || '',
    action: process.env['ACTION'] || '',
    extraAuthParameters: {
      acr_values: process.env['ACR_VALUES'] || ''
    }
  };
}
