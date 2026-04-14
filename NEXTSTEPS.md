# Blokaz — Next Steps

## Current State

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Done | Project scaffold (Vite + React + TypeScript + Tailwind) |
| Phase 1 | ✅ Done | Game engine — shapes, grid, RNG, scoring, session, replay (33 tests) |
| Phase 2 | ✅ Done | Canvas UI — drag-and-drop gameplay, animations, game over screen |
| Phase 3 | ✅ Done | Smart contracts — BlokzGame.sol, 16 Forge tests, deploy script |
| Phase 4 | ⬜ Next | Frontend ↔ chain integration |
| Phase 5 | ⬜ Soon | Farcaster MiniApp polish & production deploy |
| Phase 6 | ⬜ Later | Fuzz testing, invariant tests, QA |

The game is **fully playable offline** in the browser. Contracts are written and tested but **not yet deployed** to any network.

---

## Phase 4 — Frontend ↔ Chain Integration

### Prerequisites before starting

1. **Deploy to Alfajores testnet** — you need a funded wallet:
   ```bash
   cd contracts
   cp .env.example .env
   # Fill in PRIVATE_KEY and CELOSCAN_API_KEY
   forge script script/Deploy.s.sol \
     --rpc-url $ALFAJORES_RPC \
     --broadcast --verify
   ```
   Get testnet CELO at [faucet.celo.org](https://faucet.celo.org).
   Record the deployed proxy address in `contracts/DEPLOYMENTS.md`.

---

### Task 4.1 — Wagmi + Farcaster Connector

**Install:**
```bash
pnpm add wagmi viem @tanstack/react-query \
  @farcaster/miniapp-sdk @farcaster/miniapp-wagmi-connector
```

**Create `src/chain/config.ts`:**
- Configure Wagmi with `celo` and `celoAlfajores` chains
- Use `farcasterMiniApp()` connector
- HTTP transports for both chains

**Create `src/chain/contracts.ts`:**
- `BLOKZ_GAME_ADDRESS` — proxy address from the testnet deployment
- `CUSD_ADDRESS` — `0x765DE816845861e75A25fCA122bb6898B8B1282a`
- `BLOKZ_ABI` — copy from `contracts/out/BlokzGame.sol/BlokzGame.json`

**Update `src/main.tsx`:** Wrap `<App>` in `WagmiProvider` + `QueryClientProvider`.

**Create `src/components/WalletStatus.tsx`:**
- Connected: shows truncated address
- Disconnected: shows "Connect" button
- In MiniApp mode: auto-connects, hides button

**Acceptance:** App connects to wallet inside Warpcast. Address visible in header.

---

### Task 4.2 — Game Lifecycle Hooks

**Create `src/chain/useStartGame.ts`:**
1. Generate 32-byte random seed via `crypto.getRandomValues()`
2. Compute `seedHash = keccak256(abi.encodePacked(seed, playerAddress))`
3. Call `startGame(seedHash)` on the contract
4. On confirmation: store seed in `gameStore`, create `new GameSession(BigInt(seed))`

**Create `src/chain/useSubmitScore.ts`:**
1. Call `gameSession.getReplayProof()` → `{ seed, packedMoves, moveCount, finalScore }`
2. Call `submitScore(gameId, seed, packedMoves, score, moveCount)`
3. On confirmation: show success toast with CeloScan link

**Update `GameOverModal`:**
- "Submit Score" button triggers `useSubmitScore`
- Show spinner while tx is pending
- Show success state with tx hash and score rank
- Show error state with retry option

**Acceptance:** Play a game → game over → submit score → visible on-chain in CeloScan.

---

### Task 4.3 — Leaderboard UI

**Create `src/chain/useLeaderboard.ts`:**
- Reads `getLeaderboard(epoch)` and `getCurrentEpoch()` from the contract
- Returns `{ entries, epoch, isLoading, error }`
- Auto-refreshes every 30 seconds

**Create `src/components/LeaderboardView.tsx`:**
- Top 50 scores for the current epoch, sorted descending
- Each row: rank number, truncated address, score, time ago
- Highlight the current player's entry
- Tabs for "This Week" / previous epochs
- "Your Best" section pinned at top

**Acceptance:** Submitted scores appear on the leaderboard within one block.

---

### Task 4.4 — Tournament Flow

**Create `src/chain/useTournament.ts`** with hooks:
- `useTournamentList()` — reads active tournaments
- `useJoinTournament(id, entryFee)` — batches cUSD `approve` + `joinTournament` via EIP-5792 `useSendCalls`
- `useSubmitTournamentScore(tournamentId, ...)` — submits a tournament score
- `useTournamentResults(id)` — reads final standings

**Create `src/components/TournamentLobby.tsx`:**
- List of active tournaments: entry fee, player count, time remaining
- "Join" button → triggers batch tx (approve + join in one click)
- After joining: "Play Tournament Game" button launches `GameScreen` in tournament mode

**Create `src/components/TournamentResults.tsx`:**
- Final standings with prize amounts per place
- "Collect Prize" button for winners (calls `finalizeTournament` if not yet done)

**Acceptance:** Full tournament lifecycle works end-to-end with real cUSD on testnet.

---

## Phase 5 — MiniApp Integration & Polish

### Task 5.1 — Farcaster SDK Integration

**Create `src/miniapp/init.ts`:**
- Call `sdk.actions.ready()` after the first render completes
- Store QuickAuth token
- Guard with `try/catch` — gracefully degrade in plain browser

**Update `src/miniapp/haptics.ts`:**
Replace console.log stubs with real SDK calls:
```typescript
import { sdk } from '@farcaster/miniapp-sdk'
export const hapticImpact    = () => sdk.haptics.impactOccurred('medium')
export const hapticSelection = () => sdk.haptics.selectionChanged()
export const hapticNotification = () => sdk.haptics.notificationOccurred('success')
```
Wrap each in `try/catch` + `isInMiniApp()` guard.

**Create `src/miniapp/env.ts`:**
```typescript
export const isInMiniApp = () => Boolean(window.frameElement || ...)
export const useIsMiniApp = () => ...
```

**Acceptance:** App loads instantly in Warpcast (no infinite splash). Haptics fire.

---

### Task 5.2 — Social Sharing

**Create `src/miniapp/share.ts`:**
```typescript
export function shareScore(score: number, maxCombo: number): void {
  const text = `🧱 I scored ${score.toLocaleString()} in Blokaz!\n🔥 Max combo: x${maxCombo}\nCan you beat me? 👇`
  // MiniApp mode: sdk.actions.openUrl(castComposerUrl)
  // Browser mode: navigator.clipboard.writeText(text) + toast
}
```

**Update `GameOverModal`:** Enable the "Share" button — triggers `shareScore`.

**Acceptance:** Sharing produces a formatted score card; works in both browser and Warpcast.

---

### Task 5.3 — Production Build & Deploy

1. **Create `public/manifest.json`** (Farcaster MiniApp manifest):
   ```json
   {
     "name": "Blokaz",
     "description": "Block puzzle meets blockchain. Clear lines, chain combos, win cUSD.",
     "iconUrl": "https://blokaz.xyz/icon-512.png",
     "splashImageUrl": "https://blokaz.xyz/splash-1920x1080.png",
     "splashBackgroundColor": "#0a0a0c",
     "url": "https://blokaz.xyz",
     "requiredChains": [42220],
     "requiredCapabilities": ["wallet_sendCalls"]
   }
   ```

2. **Create placeholder assets** — `public/icon-512.png`, `public/splash-1920x1080.png`

3. **Configure Vite for production:**
   - Vendor chunk splitting for `wagmi`/`viem`
   - Asset hashing, gzip compression

4. **Deploy to Vercel:**
   - `vercel.json` with SPA rewrite rules (`/* → /index.html`)
   - Environment variables: `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`

5. **Mainnet deploy** — when ready, re-run the deploy script against Celo mainnet:
   ```bash
   forge script script/Deploy.s.sol \
     --rpc-url https://forno.celo.org \
     --broadcast --verify
   ```
   Update `src/chain/contracts.ts` with the mainnet address.

6. **Publish on Farcaster** — submit the manifest URL via Warpcast developer settings.

**Acceptance:** Game is live at a public URL, playable inside Warpcast, connected to Celo mainnet.

---

## Phase 6 — Testing, QA & Hardening

### Task 6.1 — Engine Fuzz Testing

**Create `src/engine/__tests__/fuzz.test.ts`:**
- Run 1,000 automated games with random seeds
- Each game: pick the first valid placement for each piece until game over
- Assert: score ≥ 0, no runtime errors, replay proof round-trips losslessly
- Assert: two runs with the same seed produce identical move histories

### Task 6.2 — Contract Invariant Testing

**Create `contracts/test/BlokzGame.invariant.t.sol`:**
- Contract cUSD balance ≥ sum of all unfunded prize pools
- Leaderboard length never exceeds 50
- No player has more than 1 active game
- `protocolRevenue + weeklyRewardPool + distributed = total cUSD ever received`
- Fuzz `_spotCheckMoves` with random inputs — valid inputs never revert

### Task 6.3 — UX & Performance Polish

- Canvas DPR scaling (sharp rendering on Retina/high-DPI screens)
- Responsive canvas resize on orientation change
- Keyboard support for desktop (arrow keys to move, space to place)
- Loading states and skeleton screens during chain reads
- Error boundaries around chain-dependent components
- Offline/disconnected mode gracefully falls back to score-only play

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/engine/game.ts` | `GameSession` class — core game logic |
| `src/engine/replay.ts` | `buildProof()` — packs moves for on-chain submission |
| `src/stores/gameStore.ts` | Zustand store — bridges engine to React |
| `src/canvas/GameScreen.tsx` | Main React component — RAF render loop |
| `contracts/src/BlokzGame.sol` | UUPS proxy contract — all on-chain logic |
| `contracts/script/Deploy.s.sol` | Deployment script |
| `contracts/.env.example` | Required env vars for deployment |
| `02-blokaz-implementation-plan.md` | Full detailed plan with exact prompts |
