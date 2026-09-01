import { Router } from 'express'
import { createPublicClient, http, fallback, keccak256, encodePacked } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'
import dotenv from 'dotenv'
import { replayAndValidateScore } from '../engine/scoreReplay.js'
dotenv.config()

// Backup public endpoints so a flaky primary RPC can't fail the on-chain game
// verification and block legitimate score submissions with 503s.
const BACKUP_RPCS = ['https://forno.celo.org', 'https://1rpc.io/celo']

const router = Router()

const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY
const TOURNAMENT_ADDRESS = process.env.TOURNAMENT_ADDRESS
const CHAIN_ID = Number(process.env.CHAIN_ID)
const RPC_URL = process.env.RPC_URL

const account = privateKeyToAccount(SIGNER_PRIVATE_KEY)
const publicClient = createPublicClient({
  chain: celo,
  transport: fallback([
    http(RPC_URL),
    ...BACKUP_RPCS.filter((u) => u !== RPC_URL).map((u) => http(u)),
  ]),
})

const domain = {
  name: 'BlokzTournament',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: TOURNAMENT_ADDRESS,
}

const types = {
  StartGame: [
    { name: 'player', type: 'address' },
    { name: 'tournamentId', type: 'uint256' },
    { name: 'seedHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  SubmitScore: [
    { name: 'player', type: 'address' },
    { name: 'tournamentId', type: 'uint256' },
    { name: 'gameId', type: 'uint256' },
    { name: 'score', type: 'uint32' },
    { name: 'deadline', type: 'uint256' },
  ],
}

const GAMES_ABI = [{
  name: 'games', type: 'function', stateMutability: 'view',
  inputs: [{ name: '', type: 'uint256' }],
  outputs: [
    { name: 'player', type: 'address' },
    { name: 'tournamentId', type: 'uint256' },
    { name: 'seedHash', type: 'bytes32' },
    { name: 'score', type: 'uint32' },
    { name: 'startedAt', type: 'uint64' },
    { name: 'submittedAt', type: 'uint64' },
    { name: 'status', type: 'uint8' },
  ],
}]

/**
 * Verifies the submission against the on-chain game record:
 *   - the game belongs to the claimed player and tournament
 *   - the submitted seed matches the seedHash committed at game start
 *     (keccak256(seed ‖ player) — same commitment the contract stores)
 * Returns the engine seed (localSeed) the client derived from that commitment,
 * so the replay validator can verify the dealt pieces.
 * Throws on RPC failure — the caller maps that to a retryable 503.
 */
async function verifyOnChainGame(tid, gid, seed, player) {
  const [gamePlayer, gameTid, seedHash] = await publicClient.readContract({
    address: TOURNAMENT_ADDRESS,
    abi: GAMES_ABI,
    functionName: 'games',
    args: [BigInt(gid)],
  })
  if (gamePlayer.toLowerCase() !== String(player).toLowerCase()) {
    return { error: 'Game does not belong to this player' }
  }
  if (gameTid !== BigInt(tid)) {
    return { error: 'Game does not belong to this tournament' }
  }
  const expectedHash = keccak256(encodePacked(['bytes32', 'address'], [seed, player]))
  if (expectedHash !== seedHash) {
    return { error: 'Seed does not match the on-chain commitment' }
  }
  // Same derivation the client uses: first 8 bytes of the commitment hash
  return { localSeed: BigInt(expectedHash.slice(0, 18)) }
}

function validateScore(tid, gid, score, moves, localSeed, rulesVersion) {
  console.log(`Validating score for Tournament ${tid}, Game ${gid}: ${score} (${moves?.length ?? 0} moves, rules v${rulesVersion})`)
  const result = replayAndValidateScore(moves, Number(score), localSeed, rulesVersion)
  if (!result.ok) console.warn(`[sign] Score replay failed for tid=${tid} gid=${gid} claimed=${score} rules=v${rulesVersion}: ${result.reason}`)
  return result.ok
}

router.post('/sign-start', async (req, res) => {
  try {
    const { tid, seedHash, player } = req.body

    let nonce
    try {
      nonce = await publicClient.readContract({
        address: TOURNAMENT_ADDRESS,
        abi: [{
          name: 'userNonces', type: 'function', stateMutability: 'view',
          inputs: [{ name: '', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        }],
        functionName: 'userNonces',
        args: [player],
      })
    } catch {
      nonce = 0n
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
    const signature = await account.signTypedData({
      domain, types, primaryType: 'StartGame',
      message: { player, tournamentId: BigInt(tid), seedHash, nonce: BigInt(nonce), deadline },
    })

    const recovered = await publicClient.verifyTypedData({
      address: account.address, domain, types, primaryType: 'StartGame',
      message: { player, tournamentId: BigInt(tid), seedHash, nonce: BigInt(nonce), deadline },
      signature,
    })
    if (!recovered) console.error('CRITICAL: Server generated an unverifiable signature')

    res.json({ signature, nonce: nonce.toString(), deadline: deadline.toString() })
  } catch (error) {
    console.error('SERVER ERROR in /sign-start:', error)
    res.status(500).json({ error: 'Failed to generate signature', details: error.message })
  }
})

router.post('/sign-submit', async (req, res) => {
  try {
    const { tid, gid, score, moves, seed, player } = req.body

    if (!/^0x[0-9a-fA-F]{40}$/.test(String(player)) || !/^0x[0-9a-fA-F]{64}$/.test(String(seed))) {
      return res.status(400).json({ error: 'Invalid player or seed' })
    }

    // Ruleset the run was played under. Pre-v2 clients don't send the field;
    // their games were played under v1 and must be validated as v1.
    const rulesVersion = req.body.rulesVersion === undefined ? 1 : Number(req.body.rulesVersion)
    if (rulesVersion !== 1 && rulesVersion !== 2) {
      return res.status(400).json({ error: 'Invalid rulesVersion' })
    }

    // Verify against the on-chain game before signing anything. RPC failures
    // return 503 so the client's retry loop can try again — never sign blind.
    let onChain
    try {
      onChain = await verifyOnChainGame(tid, gid, seed, player)
    } catch (err) {
      console.error('[sign] On-chain game verification unavailable:', err?.message ?? err)
      return res.status(503).json({ error: 'Chain verification unavailable — please retry' })
    }
    if (onChain.error) {
      return res.status(403).json({ error: onChain.error })
    }

    if (!validateScore(tid, gid, score, moves, onChain.localSeed, rulesVersion)) {
      return res.status(403).json({ error: 'Invalid score submission' })
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
    const signature = await account.signTypedData({
      domain, types, primaryType: 'SubmitScore',
      message: { player, tournamentId: BigInt(tid), gameId: BigInt(gid), score: Number(score), deadline },
    })

    res.json({ signature, deadline: deadline.toString() })
  } catch (error) {
    console.error('Error signing submit:', error)
    res.status(500).json({ error: 'Failed to generate signature' })
  }
})

export { account, publicClient, TOURNAMENT_ADDRESS }
export default router
