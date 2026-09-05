import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsService } from './events.service';
import { ALESHKINO_TRACK_ID } from '../tracks/aleshkino';
import { parseCreateEventBody } from './parse-create-event';

describe('parseCreateEventBody', () => {
  it('requires name, sport and eventDate', () => {
    expect(() => parseCreateEventBody({})).toThrow(BadRequestException);
  });

  it('defaults eventType to RACE', () => {
    const parsed = parseCreateEventBody({
      name: 'КТ Алёшкино',
      sport: 'SKI',
      eventDate: '2026-12-06',
    });
    expect(parsed.eventType).toBe('RACE');
    expect(parsed.eventDate.toISOString().slice(0, 10)).toBe('2026-12-06');
  });

  it('rejects registrationOpen after registrationClose', () => {
    expect(() =>
      parseCreateEventBody({
        name: 'КТ',
        sport: 'SKI',
        eventDate: '2026-12-06',
        registrationOpen: '2026-12-05T10:00:00.000Z',
        registrationClose: '2026-12-04T10:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('EventsService', () => {
  const prisma = {
    track: { findUnique: jest.fn() },
    event: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };
  const rolesService = { assertAdminAccess: jest.fn() };
  const usersService = { findBySub: jest.fn() };

  const service = new EventsService(
    prisma as never,
    rolesService as never,
    usersService as never,
  );

  beforeEach(() => {
    prisma.track.findUnique.mockReset();
    prisma.event.create.mockReset();
    prisma.event.findMany.mockReset();
    prisma.event.findUnique.mockReset();
    rolesService.assertAdminAccess.mockReset();
    usersService.findBySub.mockReset();
  });

  it('checks admin access before creating', async () => {
    rolesService.assertAdminAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      service.create('sub-1', { name: 'КТ', sport: 'SKI', eventDate: '2026-12-06' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('creates an event on Алёшкино', async () => {
    rolesService.assertAdminAccess.mockResolvedValue(undefined);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.track.findUnique.mockResolvedValue({ id: ALESHKINO_TRACK_ID });
    prisma.event.create.mockResolvedValue({
      id: 'event-1',
      trackId: ALESHKINO_TRACK_ID,
      name: 'КТ Алёшкино',
      eventType: 'TIME_TRIAL',
      sport: 'SKI',
      eventDate: new Date('2026-12-06T00:00:00.000Z'),
      distanceKm: new Prisma.Decimal('10.5'),
      description: 'Контрольная тренировка',
      registrationOpen: null,
      registrationClose: null,
      status: 'PLANNED',
      createdById: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    });

    await expect(
      service.create('sub-1', {
        name: 'КТ Алёшкино',
        eventType: 'TIME_TRIAL',
        sport: 'SKI',
        eventDate: '2026-12-06',
        distanceKm: 10.5,
        description: 'Контрольная тренировка',
      }),
    ).resolves.toMatchObject({
      id: 'event-1',
      trackId: ALESHKINO_TRACK_ID,
      eventType: 'TIME_TRIAL',
      sport: 'SKI',
      eventDate: '2026-12-06',
      distanceKm: 10.5,
      status: 'PLANNED',
      createdBy: 'user-1',
    });

    expect(prisma.track.findUnique).toHaveBeenCalledWith({
      where: { id: ALESHKINO_TRACK_ID },
    });
    expect(prisma.event.create).toHaveBeenCalled();
  });

  it('fails when Алёшкино is not seeded', async () => {
    rolesService.assertAdminAccess.mockResolvedValue(undefined);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.track.findUnique.mockResolvedValue(null);

    await expect(
      service.create('sub-1', {
        name: 'КТ',
        sport: 'SKI',
        eventDate: '2026-12-06',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists recent events with registration counts', async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        name: 'КТ Алёшкино',
        eventDate: new Date('2026-12-06T00:00:00.000Z'),
        status: 'PLANNED',
        track: { name: 'Алёшкино' },
        _count: { registrations: 2 },
      },
    ]);

    await expect(service.listRecent()).resolves.toEqual([
      {
        id: 'event-1',
        name: 'КТ Алёшкино',
        eventDate: '2026-12-06',
        status: 'PLANNED',
        trackName: 'Алёшкино',
        registeredCount: 2,
      },
    ]);
    expect(prisma.event.findMany).toHaveBeenCalled();
  });

  it('returns event details with participants', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      trackId: ALESHKINO_TRACK_ID,
      name: 'КТ Алёшкино',
      eventType: 'TIME_TRIAL',
      sport: 'SKI',
      eventDate: new Date('2026-12-06T00:00:00.000Z'),
      distanceKm: new Prisma.Decimal('10.5'),
      description: 'Контрольная тренировка',
      registrationOpen: null,
      registrationClose: null,
      status: 'PLANNED',
      createdById: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
      track: {
        id: ALESHKINO_TRACK_ID,
        name: 'Алёшкино',
        locationCity: 'Москва',
        mapLink: null,
      },
      createdBy: {
        id: 'user-1',
        firstName: 'Иван',
        lastName: 'Петров',
        userName: 'ivan',
      },
      registrations: [
        {
          id: 'reg-1',
          status: 'CONFIRMED',
          note: null,
          registeredAt: new Date('2026-09-01T10:00:00.000Z'),
          user: {
            id: 'user-2',
            firstName: 'Анна',
            lastName: 'Смирнова',
            birthDate: new Date('1996-04-12T00:00:00.000Z'),
            gender: 'F',
            city: 'Москва',
            district: 'САО',
            team: 'СК Север',
          },
        },
      ],
    });

    await expect(service.findById('event-1')).resolves.toMatchObject({
      id: 'event-1',
      name: 'КТ Алёшкино',
      track: { name: 'Алёшкино' },
      registrations: [
        {
          id: 'reg-1',
          fullName: 'Анна Смирнова',
          birthYear: 1996,
          team: 'СК Север',
        },
      ],
    });
  });

  it('throws when event is missing', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
