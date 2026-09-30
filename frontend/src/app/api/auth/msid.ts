import sessionManager from '@/lib/session-manager';
// LOCAL DEVELOPMENT ONLY — restore these imports and the original factory before committing.
// import type { AuthType, TenantEnv } from '@uhg-optum-coreplatform/security-as-a-service-pkg';
// import { idpServerSessionIdCachePspFactory } from '@uhg-optum-coreplatform/security-as-a-service-pkg/src/factories/serverCache/serverSessionIdCacheFactory';

const config = {
    config: {
        idpType: 'entraid',
        authUrl: process.env['PING_FED_AUTH_URL'] ?? '',
        authTokenPath: process.env['AUTH_TOKEN_PATH'] ?? '',
        clientId: process.env['PING_FED_CLIENT_ID'] ?? '',
        clientSecret: process.env['PING_FED_CLIENT_SECRET'] ?? '',
        redirectUri: process.env['REDIRECT_URI'] ?? ''
    },
    persistentStateManager: sessionManager,
    pspConfig: {
        env: process.env['AUTH_PASS_ENV'] ?? '',
        idpTokenType: 'entraid',
        isPspV2: true,
        clientId: process.env['AUTHPASS_CLIENT_ID'] ?? '',
        clientSecret: process.env['AUTHPASS_CLIENT_SECRET'] ?? ''
    }
};

void config;
void sessionManager;

export const msidFactory = {
    async exchangeCodeForToken({ code }: { code: string }) {
        return { sessionId: code || 'local-development-session' };
    },
    async getValidPspToken(_sessionId: string) {
        return undefined;
    },
    async getValidToken(_sessionId: string) {
        return { decodedToken: { name: 'Local developer', authentication: 'disabled' } };
    }
};
export default msidFactory;
