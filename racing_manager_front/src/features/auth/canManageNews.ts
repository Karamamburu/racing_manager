export function canManageNews(roles: string[] | undefined): boolean {
  return (roles ?? []).includes('ADMINISTRATOR');
}
