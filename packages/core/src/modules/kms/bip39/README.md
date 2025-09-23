# BIP39 Deterministic Key Management for Credo-TS

This module provides a BIP39-based deterministic key management service that can generate cryptographic keys from mnemonic phrases. It supports both traditional BIP32 hierarchical deterministic key derivation and specialized P-256 passkey generation using the `@algorandfoundation/dp256` library.

## Key Features

- **🔐 Deterministic Key Generation**: Same mnemonic → same keys (recoverable)
- **🌐 P-256 Passkey Support**: WebAuthn/FIDO2 passkeys using `@algorandfoundation/dp256`
- **📱 React Native Compatible**: Works with SecureEnvironment KMS
- **🔄 Fallback Support**: Random key generation when no mnemonic is available
- **🎯 Multi-Algorithm**: Ed25519, X25519, P-256, secp256k1 support

## Architecture

### Key Generation Approaches

#### 1. **P-256 Passkeys** (using `@algorandfoundation/dp256`)
- **Purpose**: WebAuthn/FIDO2 authentication
- **Domain-specific**: Keys tied to specific origins and user handles
- **Cross-platform**: Compatible with Swift and Kotlin implementations
- **Use case**: Banking, social media, e-commerce authentication

#### 2. **Other Key Types** (using Askar `transformSeedToPrivateJwk`)
- **Types**: Ed25519 (signing), X25519 (encryption), secp256k1 (Bitcoin)
- **Hierarchical**: BIP32 derivation paths
- **Use case**: General cryptography, DID operations, credentials

### Components

#### BIP39KeyManagementService
- Wrapper around existing KMS (e.g., SecureEnvironmentKeyManagementService)
- Routes P-256 keys to dp256 library
- Routes other keys to Askar transformSeedToPrivateJwk
- Provides fallback to random generation

#### BIP39MnemonicService Interface
- `getMnemonic()`: Retrieve stored mnemonic phrase
- `deriveSeedFromMnemonic()`: BIP39/BIP32 seed derivation

## Installation & Dependencies

### Core Package
```bash
npm install @credo-ts/core
```

### P-256 Passkey Support
```bash
npm install @algorandfoundation/dp256
```

### Traditional Key Types (Ed25519, X25519, etc.)
```bash
npm install @credo-ts/askar
```

### BIP39/BIP32 Libraries (for custom mnemonic service)
```bash
# For Node.js
npm install bip39 bip32 tiny-secp256k1

# For React Native
npm install react-native-bip39 @react-native-async-storage/async-storage
```

## Usage Examples

### Basic Setup

```typescript
import { BIP39KeyManagementService, BIP39MnemonicService } from '@credo-ts/core'
import { SecureEnvironmentKeyManagementService } from '@credo-ts/react-native'

// Create your mnemonic service implementation
class MyBIP39MnemonicService implements BIP39MnemonicService {
  async getMnemonic(): Promise<string> {
    // Retrieve from secure storage
    return 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  }
  
  async deriveSeedFromMnemonic(mnemonic: string, derivationPath?: string): Promise<Uint8Array> {
    // Implement BIP39 + BIP32 derivation
    // See implementation examples below
  }
}

// Set up the BIP39 KMS
const mnemonicService = new MyBIP39MnemonicService()
const baseKms = new SecureEnvironmentKeyManagementService()
const bip39Kms = new BIP39KeyManagementService({
  wrappedKms: baseKms,
  mnemonicService,
  enableDeterministicGeneration: true,
})
```

### P-256 Passkey Generation

```typescript
// Generate passkey for WebAuthn authentication
const gmailPasskey = await agent.wallet.createKey({
  keyType: { kty: 'EC', crv: 'P-256' },
  p256Options: {
    origin: 'accounts.google.com',
    userHandle: 'user@gmail.com',
    counter: 0
  }
})

// Generate passkey for GitHub
const githubPasskey = await agent.wallet.createKey({
  keyType: { kty: 'EC', crv: 'P-256' },
  p256Options: {
    origin: 'github.com', 
    userHandle: 'developer123',
    counter: 0
  }
})

// Multiple passkeys for same domain (different counter)
const secondGithubKey = await agent.wallet.createKey({
  keyType: { kty: 'EC', crv: 'P-256' },
  p256Options: {
    origin: 'github.com',
    userHandle: 'developer123',
    counter: 1  // Different key
  }
})
```

### Traditional Key Generation

```typescript
// Ed25519 signing key
const signingKey = await agent.wallet.createKey({
  keyType: { kty: 'OKP', crv: 'Ed25519' },
  derivationPath: "m/44'/0'/0'/0/0"
})

// X25519 encryption key  
const encryptionKey = await agent.wallet.createKey({
  keyType: { kty: 'OKP', crv: 'X25519' },
  derivationPath: "m/44'/0'/0'/1/0"
})

// secp256k1 Bitcoin-style key
const bitcoinKey = await agent.wallet.createKey({
  keyType: { kty: 'EC', crv: 'secp256k1' },
  derivationPath: "m/44'/0'/0'/2/0"
})
```

## Implementation Guide

### For React Native (Rocca Wallet)

1. **Install BIP39 Dependencies**:
   ```bash
   npm install react-native-bip39 @react-native-async-storage/async-storage
   # or
   npm install bip39 bip32 react-native-keychain
   ```

2. **Create Secure Mnemonic Service**:
   ```typescript
   import AsyncStorage from '@react-native-async-storage/async-storage'
   import { validateMnemonic, mnemonicToSeedSync } from 'react-native-bip39'
   import BIP32Factory from 'bip32'
   
   class SecureBIP39MnemonicService implements BIP39MnemonicService {
     private static readonly MNEMONIC_KEY = 'wallet_mnemonic_encrypted'
     
     async getMnemonic(): Promise<string> {
       // Retrieve and decrypt mnemonic from secure storage
       const encrypted = await AsyncStorage.getItem(SecureBIP39MnemonicService.MNEMONIC_KEY)
       if (!encrypted) throw new Error('No mnemonic stored')
       return this.decrypt(encrypted) // Implement encryption/decryption
     }
     
     async deriveSeedFromMnemonic(mnemonic: string, derivationPath = "m/44'/0'/0'/0/0"): Promise<Uint8Array> {
       if (!validateMnemonic(mnemonic)) {
         throw new Error('Invalid mnemonic phrase')
       }
       
       const seed = mnemonicToSeedSync(mnemonic)
       const bip32 = BIP32Factory(/* ecc library */)
       const node = bip32.fromSeed(seed)
       const derived = node.derivePath(derivationPath)
       
       if (!derived.privateKey) {
         throw new Error('Failed to derive private key')
       }
       
       return new Uint8Array(derived.privateKey)
     }
   }
   ```

3. **Integration with Existing Agent**:
   ```typescript
   // In your existing agent setup
   const secureMnemonicService = new SecureBIP39MnemonicService()
   const existingKms = new SecureEnvironmentKeyManagementService()
   const bip39Kms = new BIP39KeyManagementService(existingKms, secureMnemonicService)
   
   // Add to existing dependencies
   const dependencies = {
     ...existingDependencies,
     keyManagementServices: [bip39Kms, ...otherKmsServices],
   }
   ```

### Integration Points

The BIP39KeyManagementService integrates at these key points in Credo-TS:

1. **KeyManagementApi.createKey()**: Entry point for all key creation
2. **Agent wallet operations**: Automatic key generation for credentials, connections, etc.
3. **DID operations**: Deterministic key generation for DID creation and management

### Security Considerations

1. **Mnemonic Storage**: Store mnemonic phrases encrypted using platform-specific secure storage
2. **Derivation Paths**: Use standard BIP44 paths for interoperability
3. **Key Isolation**: Different derivation paths for different purposes (signing, encryption, etc.)
4. **Backup & Recovery**: Mnemonic phrases enable full wallet recovery

## API Reference

### BIP39KeyManagementService

```typescript
class BIP39KeyManagementService implements KeyManagementService {
  constructor(
    baseKms: KeyManagementService,
    mnemonicService: BIP39MnemonicService,
    backend = 'bip39'
  )
  
  // Implements all KeyManagementService methods
  // createKey() uses deterministic generation when mnemonic is available
}
```

### BIP39MnemonicService Interface

```typescript
interface BIP39MnemonicService {
  getMnemonic(): Promise<string>
  deriveSeedFromMnemonic(mnemonic: string, derivationPath?: string): Promise<Uint8Array>
}
```

### Options

Key creation supports additional BIP39-specific options:

```typescript
interface BIP39CreateKeyOptions extends KmsCreateKeyOptions {
  derivationPath?: string // Custom BIP32 derivation path
}
```

## Troubleshooting

### Common Issues

1. **"transformSeedToPrivateJwk is not a function"**
   - Install the `@credo-ts/askar` package
   - Import transformSeedToPrivateJwk from '@credo-ts/askar'

2. **"No mnemonic available"**
   - Ensure mnemonic is set in the BIP39MnemonicService
   - Check secure storage permissions

3. **"Invalid derivation path"**
   - Use standard BIP32 format: "m/44'/0'/0'/0/0"
   - Ensure path components are valid integers

4. **React Native build errors**
   - Install native dependencies for crypto operations
   - Configure metro bundler for crypto polyfills

### Debugging

Enable debug logging to trace key generation:

```typescript
// The service includes debug logging when mnemonic keys are created
// Look for log messages like:
// "Created deterministic key from BIP39 mnemonic with derivation path..."
```
