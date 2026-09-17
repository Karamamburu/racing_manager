export type SessionUser = {
  sub: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
};

export type PersonalProfile = {
  id?: string | null;
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  birthDate: string | null;
};

export type PersonalStats = {
  starts: number;
  wins: number;
  podiums: number;
  upcomingStarts: number;
};

export type PersonalResponse = {
  authenticated: boolean;
  user: SessionUser;
  roles: string[];
  profile: PersonalProfile | null;
  stats?: PersonalStats;
};

export type UpdatePersonalRequest = {
  firstName: string;
  lastName: string;
  gender?: 'M' | 'F' | null;
  birthDate?: string | null;
  city?: string | null;
  district?: string | null;
  team?: string | null;
};
