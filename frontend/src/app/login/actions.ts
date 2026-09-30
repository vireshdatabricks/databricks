'use server';

// LOCAL DEVELOPMENT ONLY — restore this import before committing.
// import type { IdpCLoginProps } from '@uhg-optum-coreplatform/security-as-a-service-pkg';
export type IdpCLoginProps = {
  clientId: string;
  redirectUri: string;
  responseType?: string;
  scope: string;
  action: string;
  extraAuthParameters: { acr_values: string };
};

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
