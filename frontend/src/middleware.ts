import { NextResponse, NextRequest } from 'next/server';

import { getAuthRedirectPath, isAuthDisabled } from './app/utils/auth';

export default function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const sessionId = req.cookies.get('sessionId')?.value;
    const authDisabled = isAuthDisabled();
    const redirectPath = getAuthRedirectPath({ path, hasSession: Boolean(sessionId), authDisabled });

    if (redirectPath) {
        return NextResponse.redirect(new URL(redirectPath, req.nextUrl));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/((?!api|_next/static|_next/image|fonts|.*\\.png$|.*\\.ico$|.*\\.svg$).*)']
};
