import { stripBasePath, withBasePath } from "./base-path";

const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const PUBLIC_ROUTES = ["/login"];
export const PROTECTED_ROUTE_PREFIXES = ["/dashboard"];

export const isAuthDisabled = (env: Record<string, string | undefined> = process.env) => {
  const value = env['DISABLE_AUTH']?.trim().toLowerCase();
  return value ? TRUTHY_ENV_VALUES.has(value) : false;
};

export const isProtectedRoute = (path: string) =>
  PROTECTED_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

export const isKnownRoute = (path: string) =>
  path === '/' || PUBLIC_ROUTES.some((p) => path === p || path.startsWith(`${p}/`)) || isProtectedRoute(path);

interface AuthRedirectOptions {
  path: string;
  hasSession: boolean;
  authDisabled: boolean;
}

export const getAuthRedirectPath = ({ path, hasSession, authDisabled }: AuthRedirectOptions) => {
  const relativePath = stripBasePath(path);

  if (!isKnownRoute(relativePath)) return withBasePath('/dashboard');
  if (relativePath === '/') return withBasePath('/dashboard');
  if (authDisabled) return null;
  if (hasSession && relativePath === '/login') return withBasePath('/dashboard');
  if (!hasSession && isProtectedRoute(relativePath)) return withBasePath('/login');
  return null;
};
