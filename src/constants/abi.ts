export const BLOKZ_GAME_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "initialOwner", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "activeGame",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createTournament",
    "inputs": [
      { "name": "fee", "type": "uint256", "internalType": "uint256" },
      { "name": "start", "type": "uint64", "internalType": "uint64" },
      { "name": "end", "type": "uint64", "internalType": "uint64" },
      { "name": "max", "type": "uint8", "internalType": "uint8" }
    ],
    "outputs": [{ "name": "tid", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "finalizeTournament",
    "inputs": [{ "name": "tid", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "games",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "player", "type": "address", "internalType": "address" },
      { "name": "seedHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "score", "type": "uint32", "internalType": "uint32" },
      { "name": "startedAt", "type": "uint64", "internalType": "uint64" },
      { "name": "submittedAt", "type": "uint64", "internalType": "uint64" },
      { "name": "status", "type": "uint8", "internalType": "enum BlokzGame.GameStatus" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCurrentEpoch",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLeaderboard",
    "inputs": [{ "name": "epoch", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct BlokzGame.LeaderboardEntry[]",
        "components": [
          { "name": "player", "type": "address", "internalType": "address" },
          { "name": "score", "type": "uint32", "internalType": "uint32" },
          { "name": "gameId", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "inTournament",
    "inputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" },
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "joinTournament",
    "inputs": [{ "name": "tid", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextTournamentId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "startGame",
    "inputs": [{ "name": "seedHash", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "gameId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitScore",
    "inputs": [
      { "name": "gameId", "type": "uint256", "internalType": "uint256" },
      { "name": "seed", "type": "bytes32", "internalType": "bytes32" },
      { "name": "packedMoves", "type": "uint256[]", "internalType": "uint256[]" },
      { "name": "score", "type": "uint32", "internalType": "uint32" },
      { "name": "moveCount", "type": "uint16", "internalType": "uint16" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitTournamentScore",
    "inputs": [
      { "name": "tid", "type": "uint256", "internalType": "uint256" },
      { "name": "gid", "type": "uint256", "internalType": "uint256" },
      { "name": "seed", "type": "bytes32", "internalType": "bytes32" },
      { "name": "moves", "type": "uint256[]", "internalType": "uint256[]" },
      { "name": "score", "type": "uint32", "internalType": "uint32" },
      { "name": "mCount", "type": "uint16", "internalType": "uint16" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tournaments",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "creator", "type": "address", "internalType": "address" },
      { "name": "entryFee", "type": "uint256", "internalType": "uint256" },
      { "name": "startTime", "type": "uint64", "internalType": "uint64" },
      { "name": "endTime", "type": "uint64", "internalType": "uint64" },
      { "name": "maxPlayers", "type": "uint8", "internalType": "uint8" },
      { "name": "playerCount", "type": "uint8", "internalType": "uint8" },
      { "name": "finalized", "type": "bool", "internalType": "bool" },
      { "name": "prizePool", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdrawProtocolRevenue",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawWeeklyRewardPool",
    "inputs": [{ "name": "to", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "GameStarted",
    "inputs": [
      { "name": "gameId", "type": "uint256", "indexed": true },
      { "name": "player", "type": "address", "indexed": true }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TournamentCreated",
    "inputs": [
      { "name": "tournamentId", "type": "uint256", "indexed": true },
      { "name": "creator", "type": "address", "indexed": true },
      { "name": "entryFee", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  }
] as const
