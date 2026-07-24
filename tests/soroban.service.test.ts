/**
 * Unit tests for SorobanService
 *
 * The Soroban RPC client is mocked so tests run offline without needing a
 * live Stellar node. The mock is injected via the constructor so no module-
 * level patching is required.
 *
 * Coverage:
 *   - checkConnectivity: healthy node, unhealthy/unreachable node
 *   - getLatestLedger: success, RPC failure
 *   - getNetworkInfo: success, RPC failure
 */

import { SorobanService } from '../src/blockchain/soroban.service';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock the stellar config module so the singleton client is never constructed
// during tests (avoids network calls at module load time).
jest.mock('../src/config/stellar', () => ({
  stellarConfig: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
    timeoutMs: 10000,
  },
  sorobanRpcClient: {},
  createSorobanRpcClient: jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock of rpc.Server with controllable method responses. */
function makeMockClient(
  overrides: Partial<{
    getHealth: () => Promise<StellarRpc.Api.GetHealthResponse>;
    getLatestLedger: () => Promise<StellarRpc.Api.GetLatestLedgerResponse>;
    getNetwork: () => Promise<StellarRpc.Api.GetNetworkResponse>;
  }> = {},
): StellarRpc.Server {
  return {
    getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    getLatestLedger: jest
      .fn()
      .mockResolvedValue({ sequence: 12345678, id: 'abc', protocolVersion: 21 }),
    getNetwork: jest.fn().mockResolvedValue({
      passphrase: 'Test SDF Network ; September 2015',
      protocolVersion: 21,
    }),
    ...overrides,
  } as unknown as StellarRpc.Server;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SorobanService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── checkConnectivity ──────────────────────────────────────────────────────

  describe('checkConnectivity', () => {
    it('returns connected=true with health and ledger data when node is healthy', async () => {
      const client = makeMockClient();
      const service = new SorobanService(client);

      const result = await service.checkConnectivity();

      expect(result.connected).toBe(true);
      if (result.connected) {
        expect(result.status).toBe('healthy');
        expect(result.latestLedger).toBe(12345678);
        expect(result.network).toBe('testnet');
        expect(result.networkPassphrase).toBe('Test SDF Network ; September 2015');
        expect(result.rpcUrl).toBe('https://soroban-testnet.stellar.org');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('calls getHealth and getLatestLedger in parallel (both invoked once)', async () => {
      const client = makeMockClient();
      const service = new SorobanService(client);

      await service.checkConnectivity();

      expect(client.getHealth).toHaveBeenCalledTimes(1);
      expect(client.getLatestLedger).toHaveBeenCalledTimes(1);
    });

    it('returns connected=false when getHealth throws a network error', async () => {
      const client = makeMockClient({
        getHealth: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
      });
      const service = new SorobanService(client);

      const result = await service.checkConnectivity();

      expect(result.connected).toBe(false);
      expect((result as { error: string }).error).toContain('ECONNREFUSED');
      expect(result.network).toBe('testnet');
      expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns connected=false when getLatestLedger throws', async () => {
      const client = makeMockClient({
        getLatestLedger: jest.fn().mockRejectedValue(new Error('timeout')),
      });
      const service = new SorobanService(client);

      const result = await service.checkConnectivity();

      expect(result.connected).toBe(false);
    });

    it('returns connected=false and captures unknown (non-Error) throw', async () => {
      const client = makeMockClient({
        getHealth: jest.fn().mockRejectedValue('string error'),
      });
      const service = new SorobanService(client);

      const result = await service.checkConnectivity();

      expect(result.connected).toBe(false);
      expect((result as { error: string }).error).toBe('Unknown error');
    });

    it('always includes checkedAt as a valid ISO string', async () => {
      const client = makeMockClient();
      const service = new SorobanService(client);

      const result = await service.checkConnectivity();

      expect(() => new Date(result.checkedAt)).not.toThrow();
    });

    it('includes rpcUrl in both success and failure results', async () => {
      const service1 = new SorobanService(makeMockClient());
      const success = await service1.checkConnectivity();
      expect(success.rpcUrl).toBe('https://soroban-testnet.stellar.org');

      const service2 = new SorobanService(
        makeMockClient({ getHealth: jest.fn().mockRejectedValue(new Error('fail')) }),
      );
      const failure = await service2.checkConnectivity();
      expect(failure.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    });
  });

  // ── getLatestLedger ────────────────────────────────────────────────────────

  describe('getLatestLedger', () => {
    it('returns the ledger sequence number', async () => {
      const client = makeMockClient();
      const service = new SorobanService(client);

      const seq = await service.getLatestLedger();

      expect(seq).toBe(12345678);
    });

    it('propagates errors from the RPC client', async () => {
      const client = makeMockClient({
        getLatestLedger: jest.fn().mockRejectedValue(new Error('RPC down')),
      });
      const service = new SorobanService(client);

      await expect(service.getLatestLedger()).rejects.toThrow('RPC down');
    });
  });

  // ── getNetworkInfo ─────────────────────────────────────────────────────────

  describe('getNetworkInfo', () => {
    it('returns the raw network response from the RPC client', async () => {
      const client = makeMockClient();
      const service = new SorobanService(client);

      const info = await service.getNetworkInfo();

      expect(info.passphrase).toBe('Test SDF Network ; September 2015');
      expect(info.protocolVersion).toBe(21);
    });

    it('propagates errors from the RPC client', async () => {
      const client = makeMockClient({
        getNetwork: jest.fn().mockRejectedValue(new Error('network error')),
      });
      const service = new SorobanService(client);

      await expect(service.getNetworkInfo()).rejects.toThrow('network error');
    });
  });
});
