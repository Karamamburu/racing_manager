import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseCreateRegistrationBody } from './parse-create-registration';
import { RegistrationsService } from './registrations.service';

function storedRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    eventId: 'event-1',
    userId: 'user-1',
    firstName: 'Анна',
    lastName: 'Смирнова',
    gender: 'F',
    birthYear: 1996,
    city: 'Москва',
    district: 'САО',
    team: 'СК Север',
    startNumber: null,
    status: 'REGISTERED',
    note: null,
    registeredAt: new Date('2026-09-06T10:00:00.000Z'),
    updatedAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  };
}

const plannedEvent = {
  id: 'event-1',
  status: 'PLANNED',
  registrationOpen: null,
  registrationClose: null,
};

describe('parseCreateRegistrationBody', () => {
  it('requires firstName, lastName, gender and birthYear', () => {
    expect(() => parseCreateRegistrationBody({})).toThrow(BadRequestException);
  });

  it('parses a valid payload', () => {
    expect(
      parseCreateRegistrationBody({
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
        city: 'Москва',
        district: 'САО',
        team: 'СК Север',
      }),
    ).toEqual({
      firstName: 'Анна',
      lastName: 'Смирнова',
      gender: 'F',
      birthYear: 1996,
      city: 'Москва',
      district: 'САО',
      team: 'СК Север',
    });
  });

  it('rejects an invalid gender', () => {
    expect(() =>
      parseCreateRegistrationBody({
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'X',
        birthYear: 1996,
      }),
    ).toThrow(BadRequestException);
  });
});

describe('RegistrationsService', () => {
  const prisma = {
    event: { findUnique: jest.fn() },
    registration: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const usersService = { findBySub: jest.fn() };
  const service = new RegistrationsService(
    prisma as never,
    usersService as never,
  );

  beforeEach(() => {
    prisma.event.findUnique.mockReset();
    prisma.registration.findFirst.mockReset();
    prisma.registration.create.mockReset();
    prisma.registration.update.mockReset();
    usersService.findBySub.mockReset();
  });

  it('creates a guest registration without userId', async () => {
    prisma.event.findUnique.mockResolvedValue(plannedEvent);
    prisma.registration.create.mockResolvedValue(
      storedRegistration({ userId: null }),
    );

    await expect(
      service.create(undefined, 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
        city: 'Москва',
        district: 'САО',
        team: 'СК Север',
      }),
    ).resolves.toMatchObject({
      id: 'reg-1',
      eventId: 'event-1',
      userId: null,
      firstName: 'Анна',
      status: 'REGISTERED',
    });

    expect(usersService.findBySub).not.toHaveBeenCalled();
    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        userId: null,
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
        city: 'Москва',
        district: 'САО',
        team: 'СК Север',
        status: 'REGISTERED',
      },
    });
  });

  it('links a logged-in user to the registration', async () => {
    prisma.event.findUnique.mockResolvedValue(plannedEvent);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.registration.findFirst.mockResolvedValue(null);
    prisma.registration.create.mockResolvedValue(storedRegistration());

    await expect(
      service.create('sub-1', 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).resolves.toMatchObject({ userId: 'user-1' });

    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', status: 'REGISTERED' }),
    });
  });

  it('rejects a second active registration for the same user', async () => {
    prisma.event.findUnique.mockResolvedValue(plannedEvent);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.registration.findFirst.mockResolvedValue(storedRegistration());

    await expect(
      service.create('sub-1', 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it('restores a withdrawn registration for the same user', async () => {
    prisma.event.findUnique.mockResolvedValue(plannedEvent);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.registration.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedRegistration({ status: 'WITHDRAWN' }));
    prisma.registration.update.mockResolvedValue(storedRegistration());

    await expect(
      service.create('sub-1', 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
        city: 'Москва',
      }),
    ).resolves.toMatchObject({ status: 'REGISTERED' });

    expect(prisma.registration.create).not.toHaveBeenCalled();
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: expect.objectContaining({
        firstName: 'Анна',
        status: 'REGISTERED',
        startNumber: null,
      }),
    });
  });

  it('rejects registration for a missing event', async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(
      service.create(undefined, 'missing', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects registration when the event is not planned', async () => {
    prisma.event.findUnique.mockResolvedValue({
      ...plannedEvent,
      status: 'CANCELLED',
    });

    await expect(
      service.create(undefined, 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows registration before number distribution starts', async () => {
    prisma.event.findUnique.mockResolvedValue({
      ...plannedEvent,
      registrationOpen: new Date('2099-01-01T00:00:00.000Z'),
      registrationClose: new Date('2099-01-02T00:00:00.000Z'),
    });
    prisma.registration.create.mockResolvedValue(
      storedRegistration({ userId: null }),
    );

    await expect(
      service.create(undefined, 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).resolves.toMatchObject({ id: 'reg-1' });
  });

  it('rejects registration after number distribution ends', async () => {
    prisma.event.findUnique.mockResolvedValue({
      ...plannedEvent,
      registrationClose: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(
      service.create(undefined, 'event-1', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: 'F',
        birthYear: 1996,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it('withdraws the current user registration', async () => {
    prisma.event.findUnique.mockResolvedValue(plannedEvent);
    usersService.findBySub.mockResolvedValue({ id: 'user-1' });
    prisma.registration.findFirst.mockResolvedValue(storedRegistration());
    prisma.registration.update.mockResolvedValue(
      storedRegistration({ status: 'WITHDRAWN' }),
    );

    await expect(service.cancelOwn('sub-1', 'event-1')).resolves.toMatchObject({
      status: 'WITHDRAWN',
    });
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        status: 'WITHDRAWN',
        startNumber: null,
      },
    });
  });

  it('rejects cancel without an authenticated user', async () => {
    await expect(service.cancelOwn(undefined, 'event-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
