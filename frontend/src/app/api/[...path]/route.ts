import { NextRequest } from 'next/server';
import { gzipSync } from 'node:zlib';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? '/api';

// Headers that must not be blindly forwarded between the browser <-> proxy <-> backend hops.
const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length'];
// fetch() always transparently decodes gzip and can't be told not to, so ask the backend for uncompressed
// bytes instead (avoids wasting CPU compressing a hop we immediately decompress) and drop any stale encoding header.
const RESPONSE_HEADERS_TO_STRIP = [...HOP_BY_HOP_HEADERS, 'content-encoding'];

function stripHopByHopHeaders(headers: Headers): Headers {
    const copy = new Headers(headers);
    for (const name of HOP_BY_HOP_HEADERS) copy.delete(name);
    copy.set('accept-encoding', 'identity');
    return copy;
}

function stripResponseHeaders(headers: Headers): Headers {
    const copy = new Headers(headers);
    for (const name of RESPONSE_HEADERS_TO_STRIP) copy.delete(name);
    return copy;
}

// Catch-all proxy for backend routes not handled by app/api/auth or app/api/user.
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    const target = `${API_BASE_URL}${API_PREFIX}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

    const hasBody = !['GET', 'HEAD'].includes(req.method);

    let backendRes: Response;
    try {
        backendRes = await fetch(target, {
            method: req.method,
            headers: stripHopByHopHeaders(req.headers),
            body: hasBody ? await req.text() : undefined,
            cache: 'no-store'
        });
    } catch (err) {
        // Surface the underlying cause (DNS/TLS/timeout/etc.) in logs; the client only sees a generic message.
        console.error('[proxy] fetch to backend failed', { target, error: err instanceof Error ? err.message : err });
        return Response.json({ message: 'Backend service unreachable' }, { status: 502 });
    }

    // Buffer fully instead of piping backendRes.body: undici already decoded the gzip stream in-flight,
    // and re-streaming that decoded stream through a second Response can end up empty/truncated.
    const body = await backendRes.arrayBuffer();
    const responseHeaders = stripResponseHeaders(backendRes.headers);

    // Compress on this hop (the one DevTools measures) instead of relying on the now-discarded backend encoding.
    const clientAcceptsGzip = (req.headers.get('accept-encoding') ?? '').includes('gzip');
    if (clientAcceptsGzip && body.byteLength > 0) {
        responseHeaders.set('content-encoding', 'gzip');
        responseHeaders.set('vary', 'accept-encoding');
        return new Response(gzipSync(Buffer.from(body)), {
            status: backendRes.status,
            headers: responseHeaders
        });
    }

    return new Response(body, {
        status: backendRes.status,
        headers: responseHeaders
    });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };

