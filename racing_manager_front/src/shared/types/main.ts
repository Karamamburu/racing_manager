export type MainEventStatus = 'PLANNED' | 'DONE';

export type MainEventRow = {
  key: string;
  event: string;
  date: string;
  status: MainEventStatus;
  track: string;
};

export type MainSlide = {
  key: string;
  title: string;
  subtitle: string;
  image: string;
};

export type MainStat = {
  key: string;
  title: string;
  value: number;
  description: string;
  suffix?: string;
  actionLabel?: string;
};

export type MainDashboardResponse = {
  slides: MainSlide[];
  stats: MainStat[];
  events: MainEventRow[];
};
