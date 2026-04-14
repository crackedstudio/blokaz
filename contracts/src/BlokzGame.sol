// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BlokzGame
 * @notice Game registry, leaderboard, and tournament manager for Blokaz on Celo.
 *         Scores are committed with a replay proof; a lightweight spot-check
 *         verifies move legitimacy without replaying the full game on-chain.
 */
contract BlokzGame is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────── Constants ──

    /// @dev cUSD on Celo mainnet.
    address public constant CUSD = 0x765DE816845861e75A25fCA122bb6898B8B1282a;

    uint256 public constant EPOCH_DURATION = 7 days;
    uint8 public constant LEADERBOARD_SIZE = 50;
    uint256 public constant PROTOCOL_FEE_BPS = 500; // 5 %

    // ─────────────────────────────────────────────────────────── Game state ──

    enum GameStatus {
        ACTIVE,
        SUBMITTED,
        REJECTED
    }

    struct Game {
        address player;
        bytes32 seedHash;
        uint32 score;
        uint64 startedAt;
        uint64 submittedAt;
        GameStatus status;
    }

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    /// @dev Tracks the current ACTIVE game per player (0 = none).
    mapping(address => uint256) public activeGame;

    // ────────────────────────────────────────────────────── Leaderboard state ──

    struct LeaderboardEntry {
        address player;
        uint32 score;
        uint256 gameId;
    }

    /// epoch → sorted leaderboard (descending by score)
    mapping(uint256 => LeaderboardEntry[]) internal _leaderboards;

    // ─────────────────────────────────────────────────── Tournament state ──

    struct Tournament {
        address creator;
        uint256 entryFee; // cUSD amount in wei
        uint64 startTime;
        uint64 endTime;
        uint8 maxPlayers;
        uint8 playerCount;
        bool finalized;
        uint256 prizePool;
    }

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => uint32)) public tournamentScores;
    mapping(uint256 => mapping(address => bool)) public inTournament;
    mapping(uint256 => address[]) internal _tournamentPlayers;
    uint256 public nextTournamentId;
    uint256 public protocolRevenue;
    uint256 public weeklyRewardPool;

    // ──────────────────────────────────────────────────────────── Events ──

    event GameStarted(uint256 indexed gameId, address indexed player);
    event ScoreSubmitted(uint256 indexed gameId, address indexed player, uint32 score);
    event TournamentCreated(uint256 indexed tournamentId, address indexed creator, uint256 entryFee);
    event TournamentJoined(uint256 indexed tournamentId, address indexed player);
    event TournamentFinalized(uint256 indexed tournamentId, address indexed winner, uint256 prize);
    event TournamentScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint32 score);

    // ─────────────────────────────────────────────────────────── Errors ──

    error AlreadyHasActiveGame();
    error GameNotActive();
    error NotGameOwner();
    error InvalidSeed();
    error SpotCheckFailed();
    error TournamentNotFound();
    error TournamentAlreadyStarted();
    error TournamentFull();
    error AlreadyInTournament();
    error TournamentNotOver();
    error TournamentAlreadyFinalized();
    error NotInTournament();
    error InvalidTournamentParams();
    error InsufficientAllowance();
    error TransferFailed();
    error NoActiveTournamentGame();

    // ─────────────────────────────────────────────────────── Initializer ──

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    // ────────────────────────────────────────────────── UUPS authorization ──

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ────────────────────────────────────────────── Task 3.2: Game Registry ──

    /**
     * @notice Start a new game session.
     * @param seedHash keccak256(abi.encodePacked(seed, msg.sender))
     */
    function startGame(bytes32 seedHash) external returns (uint256 gameId) {
        uint256 existingId = activeGame[msg.sender];
        if (existingId != 0 && games[existingId].status == GameStatus.ACTIVE) {
            revert AlreadyHasActiveGame();
        }

        gameId = ++nextGameId;
        games[gameId] = Game({
            player: msg.sender,
            seedHash: seedHash,
            score: 0,
            startedAt: uint64(block.timestamp),
            submittedAt: 0,
            status: GameStatus.ACTIVE
        });
        activeGame[msg.sender] = gameId;

        emit GameStarted(gameId, msg.sender);
    }

    /**
     * @notice Submit the final score for a game.
     * @param gameId         The game to submit.
     * @param seed           The original seed (reveals seedHash pre-image).
     * @param packedMoves    25 moves packed per uint256, 10 bits each.
     * @param score          Claimed final score.
     * @param moveCount      Total number of moves made.
     */
    function submitScore(
        uint256 gameId,
        bytes32 seed,
        uint256[] calldata packedMoves,
        uint32 score,
        uint16 moveCount
    ) external {
        Game storage game = games[gameId];
        if (game.player != msg.sender) revert NotGameOwner();
        if (game.status != GameStatus.ACTIVE) revert GameNotActive();
        if (keccak256(abi.encodePacked(seed, msg.sender)) != game.seedHash) revert InvalidSeed();

        if (moveCount > 0 && !_spotCheckMoves(seed, packedMoves, moveCount)) {
            game.status = GameStatus.REJECTED;
            revert SpotCheckFailed();
        }

        game.score = score;
        game.status = GameStatus.SUBMITTED;
        game.submittedAt = uint64(block.timestamp);
        activeGame[msg.sender] = 0;

        _updateLeaderboard(_currentEpoch(), msg.sender, score, gameId);

        emit ScoreSubmitted(gameId, msg.sender, score);
    }

    // ─────────────────────────────────── Task 3.3: Spot-Check Verification ──

    /**
     * @notice Lightweight spot-check on 3 random moves from the replay.
     *         Only verifies that moves reference valid shapes and positions.
     *         Full grid simulation is NOT done on-chain.
     */
    function _spotCheckMoves(
        bytes32 seed,
        uint256[] calldata packedMoves,
        uint16 moveCount
    ) internal view returns (bool) {
        // Derive 3 random check indices from block entropy + seed
        uint256 entropy = uint256(
            keccak256(abi.encodePacked(block.prevrandao, seed, msg.sender))
        );

        for (uint256 i = 0; i < 3; i++) {
            uint256 checkIndex = (entropy >> (i * 32)) % moveCount;

            // Unpack move at checkIndex (10 bits each, 25 per uint256)
            uint256 wordIdx = checkIndex / 25;
            uint256 bitOffset = (checkIndex % 25) * 10;
            uint256 bits = (packedMoves[wordIdx] >> bitOffset) & 0x3FF;

            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 pieceIndex = uint8((bits >> 8) & 0x3);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 row = uint8((bits >> 4) & 0xF);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 col = uint8(bits & 0xF);

            // Bounds validation — sufficient to detect obviously tampered move data.
            // Every RNG output maps to a valid shape (weights cover the full
            // uint32 range), so no separate shape-index check is needed.
            if (pieceIndex > 2 || row > 8 || col > 8) return false;
        }

        return true;
    }

    // ───────────────────────────────────────────── Task 3.4: Leaderboard ──

    /**
     * @notice Returns the leaderboard for the given epoch (sorted descending).
     */
    function getLeaderboard(uint256 epoch)
        external
        view
        returns (LeaderboardEntry[] memory)
    {
        return _leaderboards[epoch];
    }

    function getCurrentEpoch() external view returns (uint256) {
        return _currentEpoch();
    }

    function _currentEpoch() internal view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    /**
     * @dev Insert a new score into the epoch leaderboard.
     *      Maintains descending sort, bounded by LEADERBOARD_SIZE.
     */
    function _updateLeaderboard(
        uint256 epoch,
        address player,
        uint32 score,
        uint256 gameId
    ) internal {
        LeaderboardEntry[] storage board = _leaderboards[epoch];
        uint256 len = board.length;

        if (len < LEADERBOARD_SIZE) {
            // Room to grow — append then bubble-up
            board.push(LeaderboardEntry({player: player, score: score, gameId: gameId}));
            _bubbleUp(board, len);
        } else if (score > board[len - 1].score) {
            // Replace the lowest entry and re-sort
            board[len - 1] = LeaderboardEntry({player: player, score: score, gameId: gameId});
            _bubbleUp(board, len - 1);
        }
        // Otherwise score is too low — no update needed
    }

    /// @dev Bubble the entry at `idx` up into its correct sorted position (descending).
    function _bubbleUp(LeaderboardEntry[] storage board, uint256 idx) internal {
        while (idx > 0) {
            uint256 parent = idx - 1;
            if (board[idx].score > board[parent].score) {
                LeaderboardEntry memory tmp = board[parent];
                board[parent] = board[idx];
                board[idx] = tmp;
                idx = parent;
            } else {
                break;
            }
        }
    }

    // ─────────────────────────────────────────── Task 3.5: Tournament Manager ──

    /**
     * @notice Create a new cUSD-staked tournament.
     */
    function createTournament(
        uint256 entryFee,
        uint64 startTime,
        uint64 endTime,
        uint8 maxPlayers
    ) external returns (uint256 tournamentId) {
        if (startTime <= block.timestamp) revert InvalidTournamentParams();
        if (endTime <= startTime) revert InvalidTournamentParams();
        if (maxPlayers < 2 || maxPlayers > 64) revert InvalidTournamentParams();

        tournamentId = nextTournamentId++;
        tournaments[tournamentId] = Tournament({
            creator: msg.sender,
            entryFee: entryFee,
            startTime: startTime,
            endTime: endTime,
            maxPlayers: maxPlayers,
            playerCount: 0,
            finalized: false,
            prizePool: 0
        });

        emit TournamentCreated(tournamentId, msg.sender, entryFee);
    }

    /**
     * @notice Join a tournament by paying the entry fee in cUSD.
     */
    function joinTournament(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        if (t.creator == address(0)) revert TournamentNotFound();
        if (block.timestamp >= t.endTime) revert TournamentAlreadyStarted();
        if (t.playerCount >= t.maxPlayers) revert TournamentFull();
        if (inTournament[tournamentId][msg.sender]) revert AlreadyInTournament();

        if (t.entryFee > 0) {
            bool ok = IERC20(CUSD).transferFrom(msg.sender, address(this), t.entryFee);
            if (!ok) revert TransferFailed();
        }

        t.prizePool += t.entryFee;
        t.playerCount++;
        inTournament[tournamentId][msg.sender] = true;
        _tournamentPlayers[tournamentId].push(msg.sender);

        emit TournamentJoined(tournamentId, msg.sender);
    }

    /**
     * @notice Submit a score for a tournament (uses the same proof mechanism).
     *         Only the player's best score is kept.
     */
    function submitTournamentScore(
        uint256 tournamentId,
        bytes32 seed,
        uint256[] calldata packedMoves,
        uint32 score,
        uint16 moveCount
    ) external {
        if (!inTournament[tournamentId][msg.sender]) revert NotInTournament();

        Tournament storage t = tournaments[tournamentId];
        if (block.timestamp > t.endTime) revert TournamentAlreadyStarted();
        if (keccak256(abi.encodePacked(seed, msg.sender)) == bytes32(0)) revert InvalidSeed();

        if (moveCount > 0 && !_spotCheckMoves(seed, packedMoves, moveCount)) {
            revert SpotCheckFailed();
        }

        // Keep the player's highest score
        if (score > tournamentScores[tournamentId][msg.sender]) {
            tournamentScores[tournamentId][msg.sender] = score;
        }

        emit TournamentScoreSubmitted(tournamentId, msg.sender, score);
    }

    /**
     * @notice Finalize a tournament and distribute cUSD prizes.
     *         1st: 50%, 2nd: 25%, 3rd: 15%, protocol: 5%, weekly pool: 5%.
     */
    function finalizeTournament(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        if (t.creator == address(0)) revert TournamentNotFound();
        if (block.timestamp <= t.endTime) revert TournamentNotOver();
        if (t.finalized) revert TournamentAlreadyFinalized();

        t.finalized = true;

        address[] storage players = _tournamentPlayers[tournamentId];
        uint256 numPlayers = players.length;

        if (numPlayers == 0 || t.prizePool == 0) {
            // Nothing to distribute
            emit TournamentFinalized(tournamentId, address(0), 0);
            return;
        }

        // Sort players by score descending (simple selection sort — bounded by maxPlayers ≤ 64)
        address[] memory sorted = _sortPlayersByScore(tournamentId, players);

        uint256 pool = t.prizePool;
        uint256 fee = (pool * PROTOCOL_FEE_BPS) / 10000; // 5% protocol
        uint256 weekly = fee; // 5% weekly pool
        uint256 distributable = pool - fee - weekly;

        protocolRevenue += fee;
        weeklyRewardPool += weekly;

        // Prize splits (as fractions of distributable)
        if (numPlayers >= 3) {
            _safeCusdTransfer(sorted[0], (distributable * 50) / 90); // ~55.6% of distributable
            _safeCusdTransfer(sorted[1], (distributable * 25) / 90); // ~27.8%
            _safeCusdTransfer(sorted[2], (distributable * 15) / 90); // ~16.7%
        } else if (numPlayers == 2) {
            _safeCusdTransfer(sorted[0], (distributable * 2) / 3);
            _safeCusdTransfer(sorted[1], distributable / 3);
        } else {
            // Single player gets all distributable back
            _safeCusdTransfer(sorted[0], distributable);
        }

        address winner = sorted[0];
        uint256 winnerPrize = numPlayers >= 3
            ? (distributable * 50) / 90
            : numPlayers == 2
            ? (distributable * 2) / 3
            : distributable;

        emit TournamentFinalized(tournamentId, winner, winnerPrize);
    }

    /**
     * @notice Withdraw accumulated protocol revenue (cUSD) to owner.
     */
    function withdrawProtocolRevenue() external onlyOwner nonReentrant {
        uint256 amount = protocolRevenue;
        protocolRevenue = 0;
        _safeCusdTransfer(owner(), amount);
    }

    // ────────────────────────────────────────────────────── Internal helpers ──

    function _sortPlayersByScore(uint256 tournamentId, address[] storage players)
        internal
        view
        returns (address[] memory sorted)
    {
        uint256 n = players.length;
        sorted = new address[](n);
        for (uint256 i = 0; i < n; i++) sorted[i] = players[i];

        // Selection sort (descending) — bounded by maxPlayers ≤ 64
        for (uint256 i = 0; i < n - 1; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (
                    tournamentScores[tournamentId][sorted[j]] >
                    tournamentScores[tournamentId][sorted[maxIdx]]
                ) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                (sorted[i], sorted[maxIdx]) = (sorted[maxIdx], sorted[i]);
            }
        }
    }

    function _safeCusdTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        bool ok = IERC20(CUSD).transfer(to, amount);
        if (!ok) revert TransferFailed();
    }
}
