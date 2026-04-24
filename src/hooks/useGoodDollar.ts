import { useEffect, useCallback, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useBalance, usePublicClient, useWalletClient } from 'wagmi'
import { GOODDOLLAR_ADDRESSES, G_GAME_ECONOMICS, G_IDENTITY_ABI, CFA_FORWARDER_ABI } from '../constants/contracts'
import { useGameStore } from '../stores/gameStore'
import { IdentitySDK } from '@goodsdks/citizen-sdk'

export const useGoodDollar = () => {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  const { 
    gModeEnabled, 
    setGModeEnabled, 
    isWhitelisted, 
    setIsWhitelisted, 
    isStreaming, 
    setIsStreaming,
    setClearanceTurns
  } = useGameStore()

  // 1. Check Identity whitelisting (Contract level)
  const { data: whitelistStatus, refetch: refetchIdentity } = useReadContract({
    address: GOODDOLLAR_ADDRESSES.IDENTITY,
    abi: G_IDENTITY_ABI,
    functionName: 'isWhitelisted',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
    }
  })

  useEffect(() => {
    if (whitelistStatus !== undefined) {
      setIsWhitelisted(!!whitelistStatus)
    }
  }, [whitelistStatus, setIsWhitelisted])

  // 2. Generate Official Verification Link (SDK Level)
  const [verificationUrl, setVerificationUrl] = useState<string>('https://goodid.gooddollar.org')

  useEffect(() => {
    const updateLink = async () => {
      if (address && publicClient && walletClient) {
        try {
          const sdk = new IdentitySDK({
            account: address,
            publicClient: publicClient as any,
            walletClient: walletClient as any,
            env: 'production'
          })
          const link = await sdk.generateFVLink(false, window.location.origin, 42220)
          setVerificationUrl(link)
        } catch (error) {
          console.error('Failed to generate GoodDollar FV link:', error)
          // Fallback to manual URL with signature if needed, but SDK is the "correct flow"
        }
      }
    }
    updateLink()
  }, [address, publicClient, walletClient])

  // 3. Monitor G$ Balance
  const { data: gBalance, refetch: refetchBalance } = useBalance({
    address,
    token: GOODDOLLAR_ADDRESSES.G_TOKEN,
  })

  // 4. Superfluid Stream Management
  const { writeContractAsync: createFlow } = useWriteContract()
  const { writeContractAsync: deleteFlow } = useWriteContract()

  const startGStream = useCallback(async () => {
    if (!address || !isWhitelisted) return
    
    try {
      await createFlow({
        address: GOODDOLLAR_ADDRESSES.CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'createFlow',
        args: [
          GOODDOLLAR_ADDRESSES.G_TOKEN,
          address,
          GOODDOLLAR_ADDRESSES.TREASURY,
          G_GAME_ECONOMICS.STREAM_RATE_PER_SECOND as any, // int96
          '0x'
        ]
      })
      setIsStreaming(true)
    } catch (error) {
      console.error('Failed to start G$ stream:', error)
      throw error
    }
  }, [address, isWhitelisted, createFlow, setIsStreaming])

  const stopGStream = useCallback(async () => {
    if (!address) return
    
    try {
      await deleteFlow({
        address: GOODDOLLAR_ADDRESSES.CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'deleteFlow',
        args: [
          GOODDOLLAR_ADDRESSES.G_TOKEN,
          address,
          GOODDOLLAR_ADDRESSES.TREASURY,
          '0x'
        ]
      })
      setIsStreaming(false)
    } catch (error) {
      console.error('Failed to stop G$ stream:', error)
    }
  }, [address, deleteFlow, setIsStreaming])

  // 5. Retry Payment
  const { writeContractAsync: transferG } = useWriteContract()

  const payForRetry = useCallback(async () => {
    if (!address || !isWhitelisted) return false
    
    try {
      await transferG({
        address: GOODDOLLAR_ADDRESSES.G_TOKEN,
        abi: [{
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }]
        }],
        functionName: 'transfer',
        args: [GOODDOLLAR_ADDRESSES.TREASURY, G_GAME_ECONOMICS.RETRY_COST]
      })
      setClearanceTurns(G_GAME_ECONOMICS.CLEARANCE_MODE_TURNS)
      return true
    } catch (error) {
      console.error('Failed G$ retry payment:', error)
      return false
    }
  }, [address, isWhitelisted, transferG, setClearanceTurns])

  return {
    gModeEnabled,
    setGModeEnabled,
    isWhitelisted,
    isStreaming,
    gBalance,
    startGStream,
    stopGStream,
    payForRetry,
    refetchIdentity,
    refetchBalance,
    verificationUrl
  }
}
