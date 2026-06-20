export type SessionUser = {
  sub: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
};

export type PersonalResponse = {
  authenticated: boolean;
  user: SessionUser;
  profile: {
    firstName: string | null;
    lastName: string | null;
    userName: string | null;
    email: string | null;
    gender: string | null;
    city: string | null;
    birthDate: string | null;
    lengthCm: number | null;
    weightKg: number | null;
  } | null;
};
