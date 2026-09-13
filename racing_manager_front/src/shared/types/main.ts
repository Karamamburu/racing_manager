export type MainEventStatus = 'PLANNED' | 'DONE';

export type MainEventRow = {
  key: string;
  event: string;
  date: string;
  distanceKm: number | null;
  status: MainEventStatus;
  track: string;
  registeredCount: number;
};

export type MainSlide = {
  key: string;
  title: string;
  subtitle: string;
  image: string;
};

export type MainPageUser = {
  sub: string;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
};

export type MainPageResponse = {
  page: {
    title: string;
    message: string;
  };
  authenticated: boolean;
  user: MainPageUser | null;
};

export type PlatformStats = {
  registeredUsers: number;
};
