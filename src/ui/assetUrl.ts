export function assetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || './';
  const cleanRel = relativePath.replace(/^\/+/, '');
  return base.endsWith('/') ? `${base}${cleanRel}` : `${base}/${cleanRel}`;
}
