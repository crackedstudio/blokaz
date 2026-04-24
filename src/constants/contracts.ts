export const GOODDOLLAR_ADDRESSES = {
  // Blokaz Treasury - where G$ streams and retry fees are sent
  TREASURY: '0x8186D9C6826FE9539270Be38FC3CE2cc950d60d0' as `0x${string}`, // Placeholder
  
  // G$ Token (Celo Mainnet - Native SuperToken)
  G_TOKEN: '0x62B8B11039fcfE5AB0C56E502b1C372A3D2a9C7A' as `0x${string}`,
  
  // Identity Contract (Celo Mainnet)
  IDENTITY: '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42' as `0x${string}`,
  
  // Superfluid CFA Forwarder (Celo Mainnet)
  CFA_FORWARDER: '0xcfA132E353cB4E398080B9700609bb008eceB125' as `0x${string}`,
  
  // GoodID Portal for redirection
  VERIFICATION_URL: 'https://goodid.gooddollar.org'
}

export const G_GAME_ECONOMICS = {
  // 0.05 G$ per minute in flowRate (Superfluid expects amount per second)
  // 0.05 / 60 = 0.0008333333333333334 G$ per second
  // G$ has 18 decimals generally (if SuperToken), though legacy G$ has 2.
  // Native G$ on Celo is 18 decimals.
  STREAM_RATE_PER_SECOND: BigInt(833333333333333), // Approx 0.05 G$/min in 18 decimals
  
  RETRY_COST: BigInt(10 * 10 ** 18), // 10 G$ in 18 decimals
  
  CLEARANCE_MODE_TURNS: 3
}

export const G_IDENTITY_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isWhitelisted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'lastAuthenticated',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'authenticationPeriod',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  }
] as const

export const CFA_FORWARDER_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowRate', type: 'int96' },
      { name: 'userData', type: 'bytes' }
    ],
    name: 'createFlow',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'userData', type: 'bytes' }
    ],
    name: 'deleteFlow',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' }
    ],
    name: 'getFlowrate',
    outputs: [{ name: 'flowRate', type: 'int96' }],
    stateMutability: 'view',
    type: 'function',
  }
] as const
