export function canCreateEvents(roles: string[] | undefined): boolean {
  return (roles ?? []).some(
    (role) => role === 'ADMINISTRATOR' || role === 'ORGANIZER',
  );
}

export function canChangeEventStatus(roles: string[] | undefined): boolean {
  return canCreateEvents(roles);
}

export function canManageCreatedEvent(params: {
  roles: string[] | undefined;
  profileId: string | null | undefined;
  createdById: string | null | undefined;
  status: string | undefined;
}): boolean {
  return (
    (params.roles ?? []).includes('ADMINISTRATOR') &&
    Boolean(params.profileId) &&
    params.profileId === params.createdById &&
    params.status === 'PLANNED'
  );
}
