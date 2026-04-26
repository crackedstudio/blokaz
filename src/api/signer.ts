const SIGNER_API_BASE = (import.meta.env.VITE_SIGNER_URL as string | undefined) ?? 'http://localhost:3001';

export async function requestStartSignature(tid: bigint, seedHash: `0x${string}`, player: `0x${string}`) {
  const response = await fetch(`${SIGNER_API_BASE}/sign-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tid: tid.toString(),
      seedHash,
      player,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get start signature');
  }

  const data = await response.json();
  return {
    signature: data.signature as `0x${string}`,
    nonce: BigInt(data.nonce),
    deadline: BigInt(data.deadline),
  };
}

export async function requestSubmitSignature(
  tid: bigint,
  gid: bigint,
  score: number,
  moves: any[],
  seed: `0x${string}`,
  player: `0x${string}`
) {
  const response = await fetch(`${SIGNER_API_BASE}/sign-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tid: tid.toString(),
      gid: gid.toString(),
      score,
      moves,
      seed,
      player,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get submit signature');
  }

  const data = await response.json();
  return {
    signature: data.signature as `0x${string}`,
    deadline: BigInt(data.deadline),
  };
}
