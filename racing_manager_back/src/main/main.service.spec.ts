import { Test, TestingModule } from '@nestjs/testing';
import { MainService } from './main.service';
import { UsersService } from '../users/users.service';

describe('MainService', () => {
  let service: MainService;
  const usersService = {
    findBySub: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MainService,
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    service = module.get<MainService>(MainService);
    usersService.findBySub.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return guest payload without user data', async () => {
    await expect(service.getMainPageData({})).resolves.toEqual({
      page: {
        title: 'Racing Manager',
        message: 'Main page stub',
      },
      authenticated: false,
      user: null,
    });
    expect(usersService.findBySub).not.toHaveBeenCalled();
  });

  it('should return personal data for authenticated user', async () => {
    usersService.findBySub.mockResolvedValue({
      id: 'u1',
      authentikId: 'sub-1',
      userName: 'driver',
      email: 'driver@example.com',
      firstName: 'Max',
      lastName: 'Verstappen',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.getMainPageData({
        userSub: 'sub-1',
        sessionUser: {
          sub: 'sub-1',
          email: 'driver+session@example.com',
        },
      }),
    ).resolves.toEqual({
      page: {
        title: 'Racing Manager',
        message: 'Main page stub',
      },
      authenticated: true,
      user: {
        sub: 'sub-1',
        username: 'driver',
        email: 'driver+session@example.com',
        firstName: 'Max',
        lastName: 'Verstappen',
        name: 'Max Verstappen',
      },
    });
    expect(usersService.findBySub).toHaveBeenCalledWith('sub-1');
  });
});
