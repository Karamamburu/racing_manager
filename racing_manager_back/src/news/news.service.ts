import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RoleCode } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TracksService } from '../tracks/tracks.service';
import { UsersService } from '../users/users.service';
import {
  parseCreateNewsBody,
  parseOptionalTrackId,
  parseUpdateNewsBody,
} from './parse-news';
import {
  parseUploadedNewsMedia,
  type UploadedMediaFile,
} from './parse-news-media';
import { newsHtmlToPlainText } from './sanitize-news-html';

const EXCERPT_LENGTH = 240;

export type NewsTrackRef = {
  id: string;
  name: string;
  locationCity: string | null;
};

export type NewsAuthorRef = {
  id: string;
  name: string;
};

export type NewsListItem = {
  id: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  track: NewsTrackRef;
};

export type NewsArticle = NewsListItem & {
  body: string;
  createdBy: NewsAuthorRef | null;
};

type StoredNews = {
  id: string;
  title: string;
  body: string;
  coverImageUrl: string | null;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  track: NewsTrackRef;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    userName: string;
  } | null;
};

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
    private readonly tracksService: TracksService,
    private readonly storage: StorageService,
  ) {}

  async uploadMedia(
    authentikId: string | undefined,
    file: UploadedMediaFile | undefined,
  ) {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const parsed = parseUploadedNewsMedia(file, this.storage.maxUploadBytes);
    return this.storage.upload({
      prefix: 'news',
      buffer: parsed.buffer,
      contentType: parsed.contentType,
      extension: parsed.extension,
      originalName: parsed.originalName,
    });
  }

  async list(trackIdRaw?: string): Promise<NewsListItem[]> {
    const trackId = parseOptionalTrackId(trackIdRaw);
    const rows = await this.prisma.news.findMany({
      where: trackId ? { trackId } : undefined,
      orderBy: { publishedAt: 'desc' },
      include: {
        track: {
          select: { id: true, name: true, locationCity: true },
        },
      },
    });
    return rows.map((row) => this.toListItem(row));
  }

  async findById(id: string): Promise<NewsArticle> {
    const row = await this.prisma.news.findUnique({
      where: { id },
      include: {
        track: {
          select: { id: true, name: true, locationCity: true },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('News article not found.');
    }
    return this.toArticle(row);
  }

  async create(authentikId: string | undefined, body: unknown): Promise<NewsArticle> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const actor = await this.requireActor(authentikId);
    const parsed = parseCreateNewsBody(body);
    await this.requireActiveTrack(parsed.trackId);

    const created = await this.prisma.news.create({
      data: {
        trackId: parsed.trackId,
        title: parsed.title,
        body: parsed.body,
        coverImageUrl: parsed.coverImageUrl,
        createdById: actor.id,
      },
      include: {
        track: {
          select: { id: true, name: true, locationCity: true },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
          },
        },
      },
    });
    return this.toArticle(created);
  }

  async update(
    authentikId: string | undefined,
    id: string,
    body: unknown,
  ): Promise<NewsArticle> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    await this.requireActor(authentikId);
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('News article not found.');
    }

    const parsed = parseUpdateNewsBody(body);
    if (parsed.trackId) {
      await this.requireActiveTrack(parsed.trackId);
    }

    const updated = await this.prisma.news.update({
      where: { id },
      data: {
        ...(parsed.trackId ? { trackId: parsed.trackId } : {}),
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.body ? { body: parsed.body } : {}),
        ...(parsed.coverImageUrl !== undefined
          ? { coverImageUrl: parsed.coverImageUrl }
          : {}),
      },
      include: {
        track: {
          select: { id: true, name: true, locationCity: true },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
          },
        },
      },
    });
    return this.toArticle(updated);
  }

  async remove(authentikId: string | undefined, id: string): Promise<void> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    await this.requireActor(authentikId);
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('News article not found.');
    }
    await this.prisma.news.delete({ where: { id } });
  }

  private async requireActor(authentikId: string | undefined) {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    const actor = await this.usersService.findBySub(authentikId);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    return actor;
  }

  private async requireActiveTrack(trackId: string) {
    const track = await this.tracksService.findActiveById(trackId);
    if (!track) {
      throw new BadRequestException('Track not found or inactive.');
    }
    return track;
  }

  private toListItem(row: Omit<StoredNews, 'createdBy'>): NewsListItem {
    return {
      id: row.id,
      title: row.title,
      excerpt: this.toExcerpt(row.body),
      coverImageUrl: row.coverImageUrl,
      publishedAt: row.publishedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      track: row.track,
    };
  }

  private toArticle(row: StoredNews): NewsArticle {
    return {
      ...this.toListItem(row),
      body: row.body,
      createdBy: row.createdBy
        ? {
            id: row.createdBy.id,
            name: this.formatPersonName(
              row.createdBy.firstName,
              row.createdBy.lastName,
              row.createdBy.userName,
            ),
          }
        : null,
    };
  }

  private toExcerpt(html: string): string {
    const text = newsHtmlToPlainText(html);
    if (text.length <= EXCERPT_LENGTH) return text;
    return `${text.slice(0, EXCERPT_LENGTH - 1).trim()}…`;
  }

  private formatPersonName(
    firstName: string | null,
    lastName: string | null,
    fallback: string,
  ): string {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return fullName || fallback;
  }
}
