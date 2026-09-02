'use server';

import { withBasePath } from '../utils/base-path';

export async function GET() {
  await Promise.resolve();
  const headers = new Headers();
  headers.append('Content-Type', 'text/html');
  headers.append('Set-Cookie', 'sessionId=; SameSite=Strict; Secure; HttpOnly; Path=/; Max-Age=0;');
  return new Response(`<script>window.location.href = '${withBasePath('/login')}'</script>`, { status: 200, headers });
}
