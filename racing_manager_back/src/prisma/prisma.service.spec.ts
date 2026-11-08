import {
  EnrollmentStatus,
  Prisma,
  ResultOutcome,
  StartPurposeType,
} from '../../generated/prisma';
import { PrismaService } from './prisma.service';

describe('PrismaService multi-start schema smoke', () => {
  const prisma = new PrismaService();
  const models = Prisma.dmmf.datamodel.models;
  const model = (name: string) => {
    const found = models.find((item) => item.name === name);
    if (!found) {
      throw new Error(`Model ${name} is missing from the generated client`);
    }
    return found;
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes the delegates used by the multi-start feature', () => {
    expect(prisma.start).toBeDefined();
    expect(prisma.startFormat).toBeDefined();
    expect(prisma.enrollment).toBeDefined();
    expect(prisma.idempotencyRecord).toBeDefined();
  });

  it('keeps composite uniques required by the expand phase', () => {
    expect(model('Registration').uniqueFields).toContainEqual(['id', 'eventId']);
    expect(model('Enrollment').uniqueFields).toContainEqual([
      'registrationId',
      'startId',
    ]);
    expect(model('CategoryFinish').uniqueFields).toContainEqual([
      'eventId',
      'startId',
      'formatId',
      'gender',
    ]);
    expect(model('IdempotencyRecord').uniqueFields).toContainEqual([
      'actorKey',
      'httpMethod',
      'routeTemplate',
      'idempotencyKey',
    ]);
  });

  it('links starts, enrollments and results in the generated schema', () => {
    expect(model('Result').fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['outcome', 'enrollmentId', 'enrollment']),
    );
    expect(model('CategoryFinish').fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['startId']),
    );
    expect(model('Start').fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['eventId', 'purposeType', 'sortOrder']),
    );
  });

  it('generates the lifecycle enums', () => {
    expect(Object.values(StartPurposeType)).toEqual([
      'CUP_RACE',
      'CONTROL_TRAINING',
    ]);
    expect(Object.values(EnrollmentStatus)).toEqual([
      'REGISTERED',
      'WITHDRAWN',
    ]);
    expect(Object.values(ResultOutcome)).toEqual([
      'FINISHED',
      'DNS',
      'DNF',
      'DSQ',
    ]);
  });
});
