import { useEffect, useCallback, useState, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useBalance, usePublicClient, useWalletClient } from 'wagmi'
import { GOODDOLLAR_ADDRESSES, G_GAME_ECONOMICS, G_IDENTITY_ABI, CFA_FORWARDER_ABI } from '../constants/contracts'
import { useGameStore } from '../stores/gameStore'
import { IdentitySDK, ClaimSDK } from '@goodsdks/citizen-sdk'

export const useGoodDollar = () => {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

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
    setClearanceTurns
  } = useGameStore()

  // 1. Check Identity whitelisting
  const { data: whitelistStatus, refetch: refetchIdentity } = useReadContract({
    address: GOODDOLLAR_ADDRESSES.IDENTITY,
    abi: G_IDENTITY_ABI,
    functionName: 'isWhitelisted',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected },
  })

  useEffect(() => {
    if (whitelistStatus !== undefined) setIsWhitelisted(!!whitelistStatus)
  }, [whitelistStatus, setIsWhitelisted])

  // 2. Verification link — generate once per address, not on every re-render
  const [verificationUrl, setVerificationUrl] = useState<string>('https://goodid.gooddollar.org')
  const urlAddressRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!address || !publicClient || !walletClient) return
    if (urlAddressRef.current === address) return
    urlAddressRef.current = address
    new IdentitySDK({
      account: address,
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production',
    })
      .generateFVLink(false, window.location.origin, 42220)
      .then(link => setVerificationUrl(link))
      .catch(err => console.error('Failed to generate GoodDollar FV link:', err))
  }, [address, publicClient, walletClient])

  // 3. G$ Balance
  const { data: gBalance, refetch: refetchBalance } = useBalance({
    address,
    token: GOODDOLLAR_ADDRESSES.G_TOKEN,
  })

  // 4. Entitlement — fetch once per (address, isWhitelisted) pair via a key ref
  const [entitlement, setEntitlement] = useState<bigint>(0n)
  const entitlementKeyRef = useRef('')

  useEffect(() => {
    const key = `${address}-${isWhitelisted}`
    if (!address || !isWhitelisted || entitlementKeyRef.current === key) return
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
    if (!addr || !pc || !wc) return false
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
  }, [address, refetchBalance])

  // 5. Superfluid Stream — keep writeContractAsync in a ref so startGStream/stopGStream
  //    are stable callbacks (no new reference on each render = no spurious effect triggers)
  const { writeContractAsync: createFlow } = useWriteContract()
  const { writeContractAsync: deleteFlow } = useWriteContract()
  const createFlowRef = useRef(createFlow)
  const deleteFlowRef = useRef(deleteFlow)
  useEffect(() => { createFlowRef.current = createFlow }, [createFlow])
  useEffect(() => { deleteFlowRef.current = deleteFlow }, [deleteFlow])

  const startGStream = useCallback(async () => {
    if (!address || !isWhitelisted) return
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
  }, [address, isWhitelisted, setIsStreaming])

  const stopGStream = useCallback(async () => {
    if (!address) return
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
  }, [address, setIsStreaming])

  // 6. Retry payment — guard against double-calls
  const { writeContractAsync: transferG } = useWriteContract()
  const transferGRef = useRef(transferG)
  useEffect(() => { transferGRef.current = transferG }, [transferG])
  const isPayingRef = useRef(false)

  const payForRetry = useCallback(async () => {
    if (!address || !isWhitelisted) return false
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
  }, [address, isWhitelisted, setClearanceTurns])

  return {
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
