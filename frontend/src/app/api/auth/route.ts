'use server';

import { NextRequest } from 'next/server';

import { msidFactory } from './msid';
import { withBasePath } from '@/app/utils/base-path';

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code') ?? '';

    try {
        const tokenData = await msidFactory.exchangeCodeForToken({ code });
        const sessionId = tokenData.sessionId;
        await msidFactory.getValidPspToken(sessionId);

        const headers = new Headers();
        headers.append('Content-Type', 'text/html');
        headers.append('Set-Cookie', `sessionId=${sessionId}; SameSite=Lax; Secure; HttpOnly; Path=/`);
        return new Response(`<script>window.location.href = '${withBasePath('/dashboard')}'</script>`, { status: 200, headers });
    } catch (error) {
        console.error('Authentication error:', JSON.stringify(error, null, 2));
        return new Response('Redirecting...', {
            status: 302,
            headers: { Location: `${withBasePath('/login')}?unauthorized=true` }
        });
    }
}
