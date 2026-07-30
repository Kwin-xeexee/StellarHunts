import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MaintenanceModeService } from './maintenance-mode.service';
import { MaintenanceConfig } from './entities/maintenance-config.entity';

describe('MaintenanceModeService', () => {
  let service: MaintenanceModeService;
  let repoMock: any;
  let configMock: any;

  const mockConfig: any = {
    id: 'mc-1',
    isMaintenanceMode: false,
    maintenanceMessage: 'System under maintenance',
    allowedRoutes: ['/health'],
    allowedUserIds: [],
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repoMock = {
      findOne: jest.fn().mockResolvedValue(mockConfig),
      create: jest.fn().mockImplementation((dto) => ({ ...mockConfig, ...dto })),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ ...mockConfig, ...c, updatedAt: new Date() })),
    };

    configMock = {
      get: jest.fn().mockImplementation((key, defaultVal) => defaultVal),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceModeService,
        { provide: getRepositoryToken(MaintenanceConfig), useValue: repoMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<MaintenanceModeService>(MaintenanceModeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('initializes maintenance config on module init', async () => {
    await service.onModuleInit();
    expect(repoMock.findOne).toHaveBeenCalled();
  });

  it('enables and disables maintenance mode', async () => {
    const enabled = await service.enableMaintenanceMode('admin1', 'adminUser', 'Deployment', 'System upgrading');
    expect(enabled.isMaintenanceMode).toBe(true);

    const disabled = await service.disableMaintenanceMode('admin1', 'adminUser');
    expect(disabled.isMaintenanceMode).toBe(false);
  });

  it('gets maintenance status', async () => {
    const status = await service.getMaintenanceStatus();
    expect(status.isMaintenanceMode).toBe(false);
    expect(status.maintenanceMessage).toBe('System under maintenance');
  });

  it('adds and removes allowed routes', async () => {
    const added = await service.addAllowedRoute('/custom');
    expect(added.allowedRoutes).toContain('/custom');

    const removed = await service.removeAllowedRoute('/custom');
    expect(removed.allowedRoutes).not.toContain('/custom');
  });

  it('adds and removes allowed users', async () => {
    const added = await service.addAllowedUser('u-allowed');
    expect(added.allowedUserIds).toContain('u-allowed');

    const removed = await service.removeAllowedUser('u-allowed');
    expect(removed.allowedUserIds).not.toContain('u-allowed');
  });
});
