import { NextRequest } from 'next/server';

import { msidFactory } from '../auth/msid';

export async function GET(req: NextRequest) {
    try {
        const sessionId = req.cookies.get('sessionId')?.value ?? '';
        if (!sessionId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const idpInfo = await msidFactory.getValidToken(sessionId);
        return Response.json(idpInfo.decodedToken);
    } catch (e: unknown) {
        const { message = 'Server error' } = e as { message?: string };
        return Response.json({ error: message }, { status: 500 });
    }
}
