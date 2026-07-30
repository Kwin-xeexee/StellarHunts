import { Test, TestingModule } from '@nestjs/testing';
import { NftMarketplaceStubService } from './nft-marketplace-stub.service';

describe('NftMarketplaceStubService', () => {
  let service: NftMarketplaceStubService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NftMarketplaceStubService],
    }).compile();

    service = module.get<NftMarketplaceStubService>(NftMarketplaceStubService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns all mock NFTs', () => {
    const nfts = service.findAll();
    expect(nfts.length).toBeGreaterThan(0);
    expect(nfts[0].name).toBe('Cyber Lion');
  });
});