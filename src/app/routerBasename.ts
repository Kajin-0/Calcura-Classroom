export function getRouterBasename(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') || '/';
}
