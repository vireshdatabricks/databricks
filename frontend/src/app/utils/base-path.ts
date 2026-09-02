const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const BASE_PATH =
  rawBasePath && rawBasePath !== '/' ? (rawBasePath.endsWith('/') ? rawBasePath.slice(0, -1) : rawBasePath) : '';

const ensureLeadingSlash = (path: string) => (path.startsWith('/') ? path : `/${path}`);

export const withBasePath = (path: string) => {
  const normalizedPath = ensureLeadingSlash(path);
  return BASE_PATH ? `${BASE_PATH}${normalizedPath}` : normalizedPath;
};

export const stripBasePath = (path: string) => {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return '/';
  if (path.startsWith(`${BASE_PATH}/`)) return path.slice(BASE_PATH.length);
  return path;
};
