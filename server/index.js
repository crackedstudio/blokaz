import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celoSepolia } from 'viem/chains';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const TOURNAMENT_ADDRESS = process.env.TOURNAMENT_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID);
const RPC_URL = process.env.RPC_URL;

const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
const publicClient = createPublicClient({
  chain: celoSepolia,
  transport: http(RPC_URL),
});

const domain = {
  name: 'BlokzTournament',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: TOURNAMENT_ADDRESS,
};

const types = {
  StartGame: [
    { name: 'tid', type: 'uint256' },
    { name: 'seedHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  SubmitScore: [
    { name: 'tid', type: 'uint256' },
    { name: 'gid', type: 'uint256' },
    { name: 'score', type: 'uint32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// --- Mock Score Validator ---
// In a real production app, this would verify packedMoves and seed 
// to ensure the score was actually achieved in the game.
function validateScore(tid, gid, score, moves, seed) {
  // TODO: Implement actual game logic validation
  // For now, we trust the score but log it
  console.log(`Validating score for Tournament ${tid}, Game ${gid}: ${score}`);
  return true;
}

app.post('/sign-start', async (req, res) => {
  try {
    const { tid, seedHash, player } = req.body;
    
    // 1. Fetch current nonce from contract
    const nonce = await publicClient.readContract({
      address: TOURNAMENT_ADDRESS,
      abi: [{
        name: 'userNonces',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'userNonces',
      args: [player],
    });

    // 2. Set a 10 minute deadline
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'StartGame',
      message: {
        tid: BigInt(tid),
        seedHash,
        nonce,
        deadline,
      },
    });

    res.json({
      signature,
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    });
  } catch (error) {
    console.error('Error signing start:', error);
    res.status(500).json({ error: 'Failed to generate signature' });
  }
});

app.post('/sign-submit', async (req, res) => {
  try {
    const { tid, gid, score, moves, seed } = req.body;

    // 1. Anti-Cheat Validation
    if (!validateScore(tid, gid, score, moves, seed)) {
      return res.status(403).json({ error: 'Invalid score submission' });
    }

    // 2. Sign the score
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'SubmitScore',
      message: {
        tid: BigInt(tid),
        gid: BigInt(gid),
        score: Number(score),
        deadline,
      },
    });

    res.json({
      signature,
      deadline: deadline.toString(),
    });
  } catch (error) {
    console.error('Error signing submit:', error);
    res.status(500).json({ error: 'Failed to generate signature' });
  }
});

app.listen(PORT, () => {
  console.log(`Blokz Signer Service running on port ${PORT}`);
  console.log(`Signer Address: ${account.address}`);
  console.log(`Tournament Proxy: ${TOURNAMENT_ADDRESS}`);
});
