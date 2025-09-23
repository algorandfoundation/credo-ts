/**
 * Deterministic P-256 Passkey Key Management Service for Credo-TS
 * 
 * Integrates with Credo's agent.wallet.createKey() API to generate deterministic
 * P-256 passkeys using @algorandfoundation/dp256 library.
 */

import type { AgentContext } from '../../../agent'
import type { KeyManagementService } from '../KeyManagementService'
import type {
  KmsCreateKeyOptions,
  KmsCreateKeyReturn,
  KmsCreateKeyType,
  KmsJwkPublic,
  KmsDeleteKeyOptions,
  KmsImportKeyOptions,
  KmsImportKeyReturn,
  KmsRandomBytesOptions,
  KmsRandomBytesReturn,
  KmsSignOptions,
  KmsSignReturn,
  KmsVerifyOptions,
  KmsVerifyReturn,
  KmsEncryptOptions,
  KmsEncryptReturn,
  KmsDecryptOptions,
  KmsDecryptReturn
} from '../'

import { DeterministicP256 } from '@algorandfoundation/dp256'
import { injectable } from '../../../plugins'
import { CredoError } from '../../../error'
import { Buffer } from '../../../utils'
import { base64ToBase64URL } from '../../../utils/base64'

export interface DeterministicP256Options {
  /** BIP39 mnemonic phrase */
  mnemonic: string
  /** WebAuthn origin/domain */
  origin: string
  /** WebAuthn user handle/identifier */
  userHandle: string
  /** Optional counter for multiple keys */
  counter?: number
}

// Extend Credo's create key options to include our P-256 options
export interface BIP39CreateKeyOptions<Type extends KmsCreateKeyType = KmsCreateKeyType>
  extends KmsCreateKeyOptions<Type> {
  /** Options for deterministic P-256 passkey generation */
  p256Options?: DeterministicP256Options
}

/**
 * Deterministic P-256 Key Management Service
 * 
 * A KMS wrapper that generates deterministic P-256 passkeys using dp256 library
 * when P-256 keys are requested with p256Options.
 */
@injectable()
export class BIP39KeyManagementService implements KeyManagementService {
  public readonly backend = 'BIP39P256'

  constructor(private wrappedKms: KeyManagementService) { }

  public supportsKeyType(): boolean {
    return true // We support all key types by delegating to wrapped KMS
  }

  public isOperationSupported(): boolean {
    return true
  }

  public async createKey<Type extends KmsCreateKeyType>(
    agentContext: AgentContext,
    options: BIP39CreateKeyOptions<Type>
  ): Promise<KmsCreateKeyReturn<Type>> {
    // Check if this is a P-256 key request
    if (options.type.kty === 'EC' && options.type.crv === 'P-256') {
      // P-256 keys require deterministic generation
      if (!options.p256Options) {
        throw new CredoError('p256Options required for deterministic P-256 key generation')
      }
      return this.createDeterministicP256Key(agentContext, options)
    }

    // For all other keys, delegate to wrapped KMS
    return this.wrappedKms.createKey(agentContext, options)
  }

  private async createDeterministicP256Key<Type extends KmsCreateKeyType>(
    agentContext: AgentContext,
    options: BIP39CreateKeyOptions<Type>
  ): Promise<KmsCreateKeyReturn<Type>> {
    if (!options.p256Options) {
      throw new CredoError('p256Options required for deterministic P-256 key generation')
    }

    const { mnemonic, origin, userHandle, counter = 0 } = options.p256Options

    try {
      const dp256 = new DeterministicP256()

      // Generate deterministic key from mnemonic + domain info
      const mainKey = await dp256.genDerivedMainKeyWithBIP39(mnemonic)
      const privateKey = await dp256.genDomainSpecificKeyPair(mainKey, origin, userHandle, counter)
      const publicKeyBytes = dp256.getPurePKBytes(privateKey)

      // Generate deterministic key ID
      const keyId = `p256-${origin}-${userHandle}-${counter}`

      // Convert to JWK format for Credo
      const publicJwk = {
        kty: 'EC' as const,
        crv: 'P-256' as const,
        x: base64ToBase64URL(Buffer.from(publicKeyBytes.slice(0, 32)).toString('base64')),
        y: base64ToBase64URL(Buffer.from(publicKeyBytes.slice(32, 64)).toString('base64')),
        kid: keyId
      }

      agentContext.config.logger.debug(
        `Generated deterministic P-256 passkey for origin: ${origin}, user: ${userHandle}`
      )

      return {
        keyId,
        publicJwk: publicJwk as any
      } as KmsCreateKeyReturn<Type>

    } catch (error) {
      throw new CredoError(
        `Failed to generate deterministic P-256 passkey: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      )
    }
  }

  // Delegate all other methods to wrapped KMS
  public async getPublicKey(agentContext: AgentContext, keyId: string): Promise<KmsJwkPublic | null> {
    return this.wrappedKms.getPublicKey(agentContext, keyId)
  }

  public async importKey(agentContext: AgentContext, options: any): Promise<any> {
    return this.wrappedKms.importKey(agentContext, options)
  }

  public async deleteKey(agentContext: AgentContext, options: KmsDeleteKeyOptions): Promise<boolean> {
    return this.wrappedKms.deleteKey(agentContext, options)
  }

  public randomBytes(agentContext: AgentContext, options: KmsRandomBytesOptions): KmsRandomBytesReturn {
    return this.wrappedKms.randomBytes(agentContext, options)
  }

  public async sign(agentContext: AgentContext, options: KmsSignOptions): Promise<KmsSignReturn> {
    return this.wrappedKms.sign(agentContext, options)
  }

  public async verify(agentContext: AgentContext, options: KmsVerifyOptions): Promise<KmsVerifyReturn> {
    return this.wrappedKms.verify(agentContext, options)
  }

  public async encrypt(agentContext: AgentContext, options: KmsEncryptOptions): Promise<KmsEncryptReturn> {
    return this.wrappedKms.encrypt(agentContext, options)
  }

  public async decrypt(agentContext: AgentContext, options: KmsDecryptOptions): Promise<KmsDecryptReturn> {
    return this.wrappedKms.decrypt(agentContext, options)
  }
}