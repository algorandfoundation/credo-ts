/**
 * Unit tests for BIP39KeyManagementService P-256 passkey generation
 * 
 * NOTE: This file should be moved to __tests__ directory to follow proper conventions.
 * The comprehensive test suite already exists in __tests__/BIP39KeyManagementService.test.ts
 */

import type { AgentContext } from '../../../../agent'
import type { KeyManagementService } from '../../KeyManagementService'

import { CredoError } from '../../../../error'
import { BIP39KeyManagementService } from '../BIP39KeyManagementService'

// Mock @algorandfoundation/dp256
const mockGenDerivedMainKeyWithBIP39 = jest.fn().mockResolvedValue(new Uint8Array(32).fill(1))
const mockGenDomainSpecificKeyPair = jest.fn().mockResolvedValue(new Uint8Array(32).fill(2))
const mockGetPurePKBytes = jest.fn().mockReturnValue(new Uint8Array(64).fill(3))

jest.mock('@algorandfoundation/dp256', () => ({
  DeterministicP256: jest.fn().mockImplementation(() => ({
    genDerivedMainKeyWithBIP39: mockGenDerivedMainKeyWithBIP39,
    genDomainSpecificKeyPair: mockGenDomainSpecificKeyPair,
    getPurePKBytes: mockGetPurePKBytes,
  })),
}))

const mockWrappedKms = {
  backend: 'mock-kms',
  supportsKeyType: jest.fn().mockReturnValue(true),
  isOperationSupported: jest.fn().mockReturnValue(true),
  createKey: jest.fn().mockResolvedValue({
    keyId: 'mock-key-id',
    publicJwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'mock-x-value',
      kid: 'mock-key-id',
    },
  }),
  importKey: jest.fn().mockResolvedValue({
    keyId: 'mock-imported-key',
  }),
  deleteKey: jest.fn().mockResolvedValue(undefined),
  randomBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
  sign: jest.fn().mockResolvedValue({ signature: new Uint8Array(64) }),
  verify: jest.fn().mockResolvedValue({ isValid: true }),
  decrypt: jest.fn().mockResolvedValue({ data: new Uint8Array(32) }),
  encrypt: jest.fn().mockResolvedValue({ encryptedData: new Uint8Array(64) }),
  getPublicKey: jest.fn().mockResolvedValue({
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'mock-x-value',
  }),
} as jest.Mocked<KeyManagementService>

const mockAgentContext = {
  config: {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
} as unknown as AgentContext

describe('BIP39KeyManagementService - P256 Passkeys', () => {
  let bip39Kms: BIP39KeyManagementService

  beforeEach(() => {
    jest.clearAllMocks()
    bip39Kms = new BIP39KeyManagementService(mockWrappedKms)
  })

  describe('P-256 deterministic passkey generation', () => {
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const TEST_ORIGIN = 'https://example.com'
    const TEST_USER_HANDLE = 'user123'

    test('should generate deterministic P-256 passkey with correct dp256 calls', async () => {
      const result = await bip39Kms.createKey(mockAgentContext, {
        type: { kty: 'EC', crv: 'P-256' },
        p256Options: {
          mnemonic: TEST_MNEMONIC,
          origin: TEST_ORIGIN,
          userHandle: TEST_USER_HANDLE,
        },
      })

      // Verify dp256 library calls
      expect(mockGenDerivedMainKeyWithBIP39).toHaveBeenCalledWith(TEST_MNEMONIC)
      expect(mockGenDomainSpecificKeyPair).toHaveBeenCalledWith(
        expect.any(Uint8Array), // mainKey result
        TEST_ORIGIN,
        TEST_USER_HANDLE,
        0 // default counter
      )
      expect(mockGetPurePKBytes).toHaveBeenCalledWith(expect.any(Uint8Array))

      // Verify result structure
      expect(result.keyId).toBe(`p256-${TEST_ORIGIN}-${TEST_USER_HANDLE}-0`)
      expect(result.publicJwk).toMatchObject({
        kty: 'EC',
        crv: 'P-256',
        x: expect.any(String),
        y: expect.any(String),
        kid: `p256-${TEST_ORIGIN}-${TEST_USER_HANDLE}-0`,
      })

      // Verify wrapped KMS was not called
      expect(mockWrappedKms.createKey).not.toHaveBeenCalled()
    })

    test('should use custom counter when provided', async () => {
      await bip39Kms.createKey(mockAgentContext, {
        type: { kty: 'EC', crv: 'P-256' },
        p256Options: {
          mnemonic: TEST_MNEMONIC,
          origin: TEST_ORIGIN,
          userHandle: TEST_USER_HANDLE,
          counter: 5,
        },
      })

      expect(mockGenDomainSpecificKeyPair).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        TEST_ORIGIN,
        TEST_USER_HANDLE,
        5
      )
    })

    test('should throw error when p256Options missing for P-256', async () => {
      await expect(
        bip39Kms.createKey(mockAgentContext, {
          type: { kty: 'EC', crv: 'P-256' },
          // Missing p256Options
        })
      ).rejects.toThrow('p256Options required for deterministic P-256 key generation')
    })

    test('should delegate to wrapped KMS for non-P-256 keys', async () => {
      const keyOptions = {
        type: { kty: 'OKP' as const, crv: 'Ed25519' as const },
        keyId: 'test-ed25519-key',
      }

      const result = await bip39Kms.createKey(mockAgentContext, keyOptions)

      expect(mockWrappedKms.createKey).toHaveBeenCalledWith(mockAgentContext, keyOptions)
      expect(result.keyId).toBe('mock-key-id')
    })
  })
})