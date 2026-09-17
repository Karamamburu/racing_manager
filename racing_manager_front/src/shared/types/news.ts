export type CatalogTrack = {
  id: string;
  name: string;
  locationCity: string | null;
};

export type NewsTrack = CatalogTrack;

export type NewsAuthor = {
  id: string;
  name: string;
};

export type NewsListItem = {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  track: NewsTrack;
};

export type NewsArticle = NewsListItem & {
  body: string;
  createdBy: NewsAuthor | null;
};

export type SaveNewsRequest = {
  trackId: string;
  title: string;
  body: string;
};
