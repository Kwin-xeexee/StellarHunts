import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepoMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;

  const mockUser: any = {
    id: 'u-1',
    name: 'Alice',
    username: 'alice',
    email: 'alice@example.com',
    password: 'hashedpassword',
    isActive: true,
    createdAt: new Date(),
    validatePassword: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    userRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...mockUser, ...dto })),
      save: jest.fn().mockImplementation((u) => Promise.resolve({ ...mockUser, ...u })),
      update: jest.fn().mockResolvedValue(undefined),
    };

    jwtServiceMock = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
    };

    configServiceMock = {
      get: jest.fn().mockReturnValue('15m'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('registers user successfully', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      const dto = { name: 'Alice', username: 'alice', email: 'Alice@Example.com', password: 'secretpassword' };
      const res = await service.register(dto as any);
      expect(res.accessToken).toBe('mock.jwt.token');
      expect(res.user.email).toBe('alice@example.com');
    });

    it('throws ConflictException if email exists', async () => {
      userRepoMock.findOne.mockResolvedValue(mockUser);
      const dto = { name: 'Alice', username: 'alice', email: 'Alice@Example.com', password: 'secretpassword' };

      await expect(service.register(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('logs in active user with correct password', async () => {
      userRepoMock.findOne.mockResolvedValue(mockUser);

      const res = await service.login({ email: 'alice@example.com', password: 'secretpassword' });
      expect(res.accessToken).toBe('mock.jwt.token');
      expect(userRepoMock.update).toHaveBeenCalledWith('u-1', expect.any(Object));
    });

    it('throws UnauthorizedException for invalid email or inactive account', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.login({ email: 'unknown@example.com', password: 'secret' })).rejects.toThrow(UnauthorizedException);

      userRepoMock.findOne.mockResolvedValue({ ...mockUser, isActive: false });
      await expect(service.login({ email: 'alice@example.com', password: 'secret' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser & getUserById', () => {
    it('validates user by payload', async () => {
      userRepoMock.findOne.mockResolvedValue(mockUser);
      const res = await service.validateUser({ sub: 'u-1', email: 'alice@example.com', name: 'Alice' });
      expect(res.id).toBe('u-1');
    });

    it('gets user by id', async () => {
      userRepoMock.findOne.mockResolvedValue(mockUser);
      const res = await service.getUserById('u-1');
      expect(res.id).toBe('u-1');
    });

    it('throws UnauthorizedException if user not found', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.getUserById('non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });
});
