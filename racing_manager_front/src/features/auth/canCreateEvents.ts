export function canCreateEvents(roles: string[] | undefined): boolean {
  return (roles ?? []).some(
    (role) => role === 'ADMINISTRATOR' || role === 'ORGANIZER',
  );
}
