import sessionManager from '@/lib/session-manager';
import type { AuthType, TenantEnv } from '@uhg-optum-coreplatform/security-as-a-service-pkg';
import { idpServerSessionIdCachePspFactory } from '@uhg-optum-coreplatform/security-as-a-service-pkg/src/factories/serverCache/serverSessionIdCacheFactory';

const config = {
    config: {
        idpType: 'entraid' as AuthType,
        authUrl: process.env['PING_FED_AUTH_URL'] ?? '',
        authTokenPath: process.env['AUTH_TOKEN_PATH'] ?? '',
        clientId: process.env['PING_FED_CLIENT_ID'] ?? '',
        clientSecret: process.env['PING_FED_CLIENT_SECRET'] ?? '',
        redirectUri: process.env['REDIRECT_URI'] ?? ''
    },
    persistentStateManager: sessionManager,
    pspConfig: {
        env: (process.env['AUTH_PASS_ENV'] ?? '') as TenantEnv,
        idpTokenType: 'entraid',
        isPspV2: true,
        clientId: process.env['AUTHPASS_CLIENT_ID'] ?? '',
        clientSecret: process.env['AUTHPASS_CLIENT_SECRET'] ?? ''
    }
};

export const msidFactory = idpServerSessionIdCachePspFactory(config);
export default msidFactory;
