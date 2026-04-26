import { useEffect, useCallback, useState, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useBalance, usePublicClient, useWalletClient, useChainId } from 'wagmi'
import { GOODDOLLAR_ADDRESSES, G_GAME_ECONOMICS, G_IDENTITY_ABI, CFA_FORWARDER_ABI } from '../constants/contracts'
import { useGameStore } from '../stores/gameStore'
import { IdentitySDK, ClaimSDK } from '@goodsdks/citizen-sdk'

export const useGoodDollar = () => {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const isGSupported = chainId === 42220

  // Stable refs so callbacks don't need wagmi clients in their dep arrays
  // (wagmi returns new object references on every render)
  const publicClientRef = useRef(publicClient)
  const walletClientRef = useRef(walletClient)
  useEffect(() => { publicClientRef.current = publicClient }, [publicClient])
  useEffect(() => { walletClientRef.current = walletClient }, [walletClient])

  const {
    gModeEnabled,
    setGModeEnabled,
    isWhitelisted,
    setIsWhitelisted,
    isStreaming,
    setIsStreaming,
    setClearanceTurns,
    verificationUrl,
    verificationAddress,
    setVerificationUrl
  } = useGameStore()
 
  // 1. Check Identity whitelisting
  const { data: whitelistStatus, refetch: refetchIdentity } = useReadContract({
    address: GOODDOLLAR_ADDRESSES.IDENTITY,
    abi: G_IDENTITY_ABI,
    functionName: 'isWhitelisted',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected && isGSupported },
  })
 
  useEffect(() => {
    if (whitelistStatus !== undefined) setIsWhitelisted(!!whitelistStatus)
  }, [whitelistStatus, setIsWhitelisted])
 
  // 2. Verification link — persist in store to survive remounts
  const urlAddressRef = useRef<string | undefined>(undefined)
 
  useEffect(() => {
    if (!address || !publicClient || !walletClient) {
      if (!address) setVerificationUrl(null, null)
      return
    }
    
    // If we already have a URL in the global store for THIS address, don't re-generate
    // (This prevents the digital signature popup on every remount)
    if (verificationUrl && verificationAddress === address) {
      urlAddressRef.current = address
      return
    }

    if (!isGSupported) return

    // Local address ref to prevent multiple calls in the same component instance
    if (urlAddressRef.current === address) return
 
    urlAddressRef.current = address
    new IdentitySDK({
      account: address,
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production',
    })
      .generateFVLink(false, window.location.origin, 42220)
      .then(link => {
        setVerificationUrl(link, address)
      })
      .catch(err => {
        console.error('Failed to generate GoodDollar FV link:', err)
        // Only set fallback if we don't have a link at all
        if (!verificationUrl) setVerificationUrl('https://goodid.gooddollar.org', address)
      })
  }, [address, publicClient, walletClient, verificationUrl, verificationAddress, setVerificationUrl, isGSupported])

  // 3. G$ Balance
  const { data: gBalance, refetch: refetchBalance } = useBalance({
    address,
    token: GOODDOLLAR_ADDRESSES.G_TOKEN,
    query: { enabled: !!address && isGSupported }
  })

  // 4. Entitlement — fetch once per (address, isWhitelisted) pair via a key ref
  const [entitlement, setEntitlement] = useState<bigint>(0n)
  const entitlementKeyRef = useRef('')

  useEffect(() => {
    const key = `${address}-${isWhitelisted}`
    if (!address || !isWhitelisted || !isGSupported || entitlementKeyRef.current === key) return
    const pc = publicClientRef.current
    const wc = walletClientRef.current
    if (!pc || !wc) return
    entitlementKeyRef.current = key
    const idSDK = new IdentitySDK({ account: address, publicClient: pc as any, walletClient: wc as any, env: 'production' })
    const claimSDK = new ClaimSDK({ account: address, publicClient: pc as any, walletClient: wc as any, identitySDK: idSDK, env: 'production' })
    claimSDK.checkEntitlement()
      .then(result => setEntitlement(result.amount))
      .catch(err => console.error('Failed to check GoodDollar entitlement:', err))
  }, [address, isWhitelisted])

  const claimUBI = useCallback(async () => {
    const addr = address
    const pc = publicClientRef.current
    const wc = walletClientRef.current
    if (!addr || !pc || !wc || !isGSupported) return false
    try {
      const idSDK = new IdentitySDK({ account: addr, publicClient: pc as any, walletClient: wc as any, env: 'production' })
      const claimSDK = new ClaimSDK({ account: addr, publicClient: pc as any, walletClient: wc as any, identitySDK: idSDK, env: 'production' })
      await claimSDK.claim()
      setEntitlement(0n)
      entitlementKeyRef.current = '' // allow re-fetch after claim
      refetchBalance()
      return true
    } catch (error) {
      console.error('Failed to claim G$ UBI:', error)
      return false
    }
  }, [address, refetchBalance, isGSupported])

  // 5. Superfluid Stream — keep writeContractAsync in a ref so startGStream/stopGStream
  //    are stable callbacks (no new reference on each render = no spurious effect triggers)
  const { writeContractAsync: createFlow } = useWriteContract()
  const { writeContractAsync: deleteFlow } = useWriteContract()
  const createFlowRef = useRef(createFlow)
  const deleteFlowRef = useRef(deleteFlow)
  useEffect(() => { createFlowRef.current = createFlow }, [createFlow])
  useEffect(() => { deleteFlowRef.current = deleteFlow }, [deleteFlow])

  const startGStream = useCallback(async () => {
    if (!address || !isWhitelisted || !isGSupported) return
    try {
      await createFlowRef.current({
        address: GOODDOLLAR_ADDRESSES.CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'createFlow',
        args: [GOODDOLLAR_ADDRESSES.G_TOKEN, address, GOODDOLLAR_ADDRESSES.TREASURY, G_GAME_ECONOMICS.STREAM_RATE_PER_SECOND as any, '0x'],
      })
      setIsStreaming(true)
    } catch (error) {
      console.error('Failed to start G$ stream:', error)
      throw error
    }
  }, [address, isWhitelisted, setIsStreaming, isGSupported])

  const stopGStream = useCallback(async () => {
    if (!address || !isGSupported) return
    try {
      await deleteFlowRef.current({
        address: GOODDOLLAR_ADDRESSES.CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'deleteFlow',
        args: [GOODDOLLAR_ADDRESSES.G_TOKEN, address, GOODDOLLAR_ADDRESSES.TREASURY, '0x'],
      })
      setIsStreaming(false)
    } catch (error) {
      console.error('Failed to stop G$ stream:', error)
    }
  }, [address, setIsStreaming, isGSupported])

  // 6. Retry payment — guard against double-calls
  const { writeContractAsync: transferG } = useWriteContract()
  const transferGRef = useRef(transferG)
  useEffect(() => { transferGRef.current = transferG }, [transferG])
  const isPayingRef = useRef(false)

  const payForRetry = useCallback(async () => {
    if (!address || !isWhitelisted || !isGSupported) return false
    if (isPayingRef.current) return false
    isPayingRef.current = true
    try {
      const halfAmount = G_GAME_ECONOMICS.RETRY_COST / 2n
      const abi = [{
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ type: 'bool' }],
      }] as const

      await transferGRef.current({ address: GOODDOLLAR_ADDRESSES.G_TOKEN, abi, functionName: 'transfer', args: [GOODDOLLAR_ADDRESSES.TREASURY, halfAmount] })
      await transferGRef.current({ address: GOODDOLLAR_ADDRESSES.G_TOKEN, abi, functionName: 'transfer', args: [GOODDOLLAR_ADDRESSES.UBI_POOL, halfAmount] })

      setClearanceTurns(G_GAME_ECONOMICS.CLEARANCE_MODE_TURNS)
      return true
    } catch (error) {
      console.error('Failed G$ retry payment:', error)
      return false
    } finally {
      isPayingRef.current = false
    }
  }, [address, isWhitelisted, setClearanceTurns, isGSupported])

  return {
    isGSupported,
    gModeEnabled,
    setGModeEnabled,
    isWhitelisted,
    isStreaming,
    gBalance,
    entitlement,
    claimUBI,
    startGStream,
    stopGStream,
    payForRetry,
    refetchIdentity,
    refetchBalance,
    fetchEntitlement: useCallback(() => { entitlementKeyRef.current = '' }, []),
    verificationUrl,
  }
}
