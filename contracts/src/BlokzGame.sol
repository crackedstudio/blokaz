// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BlokzGame
 * @notice Game registry, leaderboard, and tournament manager for Blokaz on Celo.
 *         Standard non-upgradeable version for easy deployment.
 */
contract BlokzGame is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // ─────────────────────────────────────────────────────────── Constants ──

    address public constant USDC = 0xcebA9300f2b948710d2653dD7B07f33A8B32118C;
    uint256 public constant EPOCH_DURATION = 7 days;
    uint8 public constant LEADERBOARD_SIZE = 50;
    uint256 public constant PROTOCOL_FEE_BPS = 500; // 5 %
    uint16 public constant TOTAL_WEIGHT = 148;

    uint8[23] private shapeWeights = [
        5, 8, 8, 10, 10, 8, 8, 4, 4, 10, 3, 6, 8, 8, 8, 8, 5, 5, 5, 5, 6, 6, 6
    ];

    // ─────────────────────────────────────────────────────────── Game state ──

    enum GameStatus { ACTIVE, SUBMITTED, REJECTED }

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
    mapping(address => uint256) public activeGame;
    mapping(uint256 => uint256) public gameTournament; // gid -> tid (0 for classic)
    mapping(address => string) public usernames;

    // ────────────────────────────────────────────────────── Leaderboard state ──

    struct LeaderboardEntry {
        address player;
        uint32 score;
        uint256 gameId;
    }

    mapping(uint256 => LeaderboardEntry[]) internal _leaderboards;
    mapping(uint256 => mapping(address => uint256)) private _playerLeaderboardIndex;

    // ─────────────────────────────────────────────────── Tournament state ──

    struct Tournament {
        address creator;
        uint256 entryFee;
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
    event UsernameRegistered(address indexed player, string username);
    event TournamentGameStarted(uint256 indexed tournamentId, uint256 indexed gameId, address indexed player);

    // ─────────────────────────────────────────────────────────── Errors ──

    error AlreadyHasActiveGame();
    error GameNotActive();
    error NotGameOwner();
    error InvalidSeed();
    error SpotCheckFailed();
    error TournamentNotFound();
    error TournamentFull();
    error AlreadyInTournament();
    error TournamentAlreadyEnded();
    error TournamentNotStarted();
    error TournamentNotOver();
    error TournamentAlreadyFinalized();
    error NotInTournament();
    error InvalidTournamentParams();
    error TransferFailed();
    error UsernameTooLong();
    error UsernameTooShort();

    // ───────────────────────────────────────────────────────── Constructor ──

    constructor(address initialOwner) Ownable(initialOwner) {
        nextGameId = 1;
    }

    // ────────────────────────────────────────────────────── Game Registry ──

    function startGame(bytes32 seedHash) external returns (uint256 gameId) {
        if (activeGame[msg.sender] != 0) revert AlreadyHasActiveGame();
        
        gameId = nextGameId++;
        games[gameId] = Game({
            player: msg.sender,
            seedHash: seedHash,
            score: 0,
            startedAt: uint64(block.timestamp),
            submittedAt: 0,
            status: GameStatus.ACTIVE
        });
        gameTournament[gameId] = 0; // Classic
        activeGame[msg.sender] = gameId;
        emit GameStarted(gameId, msg.sender);
    }

    function startTournamentGame(uint256 tid, bytes32 seedHash) external returns (uint256 gameId) {
        if (!inTournament[tid][msg.sender]) revert NotInTournament();
        if (activeGame[msg.sender] != 0) revert AlreadyHasActiveGame();
        
        Tournament storage t = tournaments[tid];
        if (block.timestamp < t.startTime) revert TournamentNotStarted();
        if (block.timestamp > t.endTime) revert TournamentAlreadyEnded();

        gameId = nextGameId++;
        games[gameId] = Game({
            player: msg.sender,
            seedHash: seedHash,
            score: 0,
            startedAt: uint64(block.timestamp),
            submittedAt: 0,
            status: GameStatus.ACTIVE
        });
        gameTournament[gameId] = tid;
        activeGame[msg.sender] = gameId;
        emit TournamentGameStarted(tid, gameId, msg.sender);
    }

    function submitScore(uint256 gameId, bytes32 seed, uint256[] calldata packedMoves, uint32 score, uint16 moveCount) external {
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

    // ─────────────────────────────────────────────────── User Identity ──

    function setUsername(string calldata name) external {
        uint256 len = bytes(name).length;
        if (len < 3) revert UsernameTooShort();
        if (len > 16) revert UsernameTooLong();
        usernames[msg.sender] = name;
        emit UsernameRegistered(msg.sender, name);
    }


    // ───────────────────────────────────────────────── Spot-Check Logic ──

    function _spotCheckMoves(bytes32 seed, uint256[] calldata packedMoves, uint16 moveCount) internal view returns (bool) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(block.prevrandao, seed, msg.sender)));
        for (uint256 i = 0; i < 3; i++) {
            uint256 checkIndex = (entropy >> (i * 32)) % moveCount;
            uint256 wordIdx = checkIndex / 25;
            uint256 bitOffset = (checkIndex % 25) * 10;
            uint256 bits = (packedMoves[wordIdx] >> bitOffset) & 0x3FF;
            if (((bits >> 8) & 0x3) > 2 || ((bits >> 4) & 0xF) > 8 || (bits & 0xF) > 8) return false;
        }
        return true;
    }

    // ─────────────────────────────────────────────────── Leaderboard ──

    function getLeaderboard(uint256 epoch) external view returns (LeaderboardEntry[] memory) {
        return _leaderboards[epoch];
    }

    function getCurrentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    function _currentEpoch() internal view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    function _updateLeaderboard(uint256 epoch, address player, uint32 score, uint256 gameId) internal {
        LeaderboardEntry[] storage board = _leaderboards[epoch];
        uint256 len = board.length;
        uint256 pIdx = _playerLeaderboardIndex[epoch][player];

        if (pIdx > 0) {
            uint256 currentIdx = pIdx - 1;
            if (score > board[currentIdx].score) {
                board[currentIdx].score = score;
                board[currentIdx].gameId = gameId;
                _bubbleUp(epoch, board, currentIdx);
            }
        } else {
            if (len < LEADERBOARD_SIZE) {
                board.push(LeaderboardEntry({player: player, score: score, gameId: gameId}));
                _playerLeaderboardIndex[epoch][player] = len + 1;
                _bubbleUp(epoch, board, len);
            } else if (score > board[len - 1].score) {
                address replacedPlayer = board[len - 1].player;
                _playerLeaderboardIndex[epoch][replacedPlayer] = 0;
                board[len - 1] = LeaderboardEntry({player: player, score: score, gameId: gameId});
                _playerLeaderboardIndex[epoch][player] = len; 
                _bubbleUp(epoch, board, len - 1);
            }
        }
    }

    function _bubbleUp(uint256 epoch, LeaderboardEntry[] storage board, uint256 idx) internal {
        while (idx > 0) {
            uint256 parent = idx - 1;
            if (board[idx].score > board[parent].score) {
                LeaderboardEntry memory tmp = board[parent];
                board[parent] = board[idx];
                board[idx] = tmp;
                _playerLeaderboardIndex[epoch][board[parent].player] = parent + 1;
                _playerLeaderboardIndex[epoch][board[idx].player] = idx + 1;
                idx = parent;
            } else break;
        }
        _playerLeaderboardIndex[epoch][board[idx].player] = idx + 1;
    }

    // ────────────────────────────────────────────── Tournament Manager ──

    function createTournament(uint256 fee, uint64 start, uint64 end, uint8 max) external onlyOwner returns (uint256 tid) {
        if (start <= block.timestamp || end <= start || max < 2) revert InvalidTournamentParams();
        tid = nextTournamentId++;
        tournaments[tid] = Tournament({
            creator: msg.sender, entryFee: fee, startTime: start, endTime: end,
            maxPlayers: max, playerCount: 0, finalized: false, prizePool: 0
        });
        emit TournamentCreated(tid, msg.sender, fee);
    }

    function joinTournament(uint256 tid) external nonReentrant {
        Tournament storage t = tournaments[tid];
        if (t.creator == address(0)) revert TournamentNotFound();
        if (block.timestamp >= t.endTime) revert TournamentAlreadyEnded();
        if (t.playerCount >= t.maxPlayers) revert TournamentFull();
        if (inTournament[tid][msg.sender]) revert AlreadyInTournament();

        if (t.entryFee > 0) {
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), t.entryFee);
            t.prizePool += t.entryFee;
        }
        t.playerCount++;
        inTournament[tid][msg.sender] = true;
        _tournamentPlayers[tid].push(msg.sender);
        emit TournamentJoined(tid, msg.sender);
    }

    function submitTournamentScore(uint256 tid, uint256 gid, bytes32 seed, uint256[] calldata moves, uint32 score, uint16 mCount) external {
        if (!inTournament[tid][msg.sender]) revert NotInTournament();
        if (gameTournament[gid] != tid) revert NotGameOwner();
        
        Game storage g = games[gid];
        if (g.player != msg.sender || g.status != GameStatus.ACTIVE) revert GameNotActive();
        
        // Ensure the seed matches the committed hash (Security parity with submitScore)
        if (keccak256(abi.encodePacked(seed, msg.sender)) != g.seedHash) revert InvalidSeed();

        Tournament storage t = tournaments[tid];
        if (block.timestamp < t.startTime) revert TournamentNotStarted();
        if (block.timestamp > t.endTime) revert TournamentAlreadyEnded();

        g.score = score;
        g.status = GameStatus.SUBMITTED;
        activeGame[msg.sender] = 0;
        if (score > tournamentScores[tid][msg.sender]) tournamentScores[tid][msg.sender] = score;
        emit TournamentScoreSubmitted(tid, msg.sender, score);
    }

    function finalizeTournament(uint256 tid) external nonReentrant {
        Tournament storage t = tournaments[tid];
        if (t.creator == address(0)) revert TournamentNotFound();
        if (t.finalized) revert TournamentAlreadyFinalized();
        if (block.timestamp <= t.endTime) revert TournamentNotOver();

        t.finalized = true;
        address[] memory players = _tournamentPlayers[tid];
        if (players.length == 0 || t.prizePool == 0) return;

        address[] memory sorted = _sortPlayersByScore(tid, players);
        uint256 pool = t.prizePool;
        
        protocolRevenue += (pool * 5) / 100;
        weeklyRewardPool += (pool * 5) / 100;

        if (players.length >= 3) {
            _safeCusdTransfer(sorted[0], (pool * 50) / 100);
            _safeCusdTransfer(sorted[1], (pool * 25) / 100);
            _safeCusdTransfer(sorted[2], (pool * 15) / 100);
        } else if (players.length == 2) {
            _safeCusdTransfer(sorted[0], (pool * 60) / 100);
            _safeCusdTransfer(sorted[1], (pool * 30) / 100);
        } else {
            _safeCusdTransfer(sorted[0], (pool * 90) / 100);
        }
        emit TournamentFinalized(tid, sorted[0], (pool * 50) / 100);
    }

    function _sortPlayersByScore(uint256 tid, address[] memory p) internal view returns (address[] memory) {
        uint256 n = p.length;
        for (uint256 i = 0; i < n - 1; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (tournamentScores[tid][p[j]] > tournamentScores[tid][p[i]]) {
                    (p[i], p[j]) = (p[j], p[i]);
                }
            }
        }
        return p;
    }

    /**
     * @notice Get the rankings for a specific tournament.
     * @param tid The tournament ID.
     */
    function getTournamentLeaderboard(uint256 tid) external view returns (LeaderboardEntry[] memory) {
        address[] memory players = _tournamentPlayers[tid];
        if (players.length == 0) return new LeaderboardEntry[](0);

        // We use a temporary array to sort without affecting state if called from a transaction,
        // although this is a view function.
        address[] memory playersCopy = new address[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            playersCopy[i] = players[i];
        }

        address[] memory sorted = _sortPlayersByScore(tid, playersCopy);
        LeaderboardEntry[] memory leaderboard = new LeaderboardEntry[](sorted.length);

        for (uint256 i = 0; i < sorted.length; i++) {
            address p = sorted[i];
            leaderboard[i] = LeaderboardEntry({
                player: p,
                score: tournamentScores[tid][p],
                gameId: 0 // In tournaments we only track top score per player
            });
        }

        return leaderboard;
    }

    /**
     * @notice Withdraw accumulated protocol revenue (cUSD) to owner.
     */
    function withdrawProtocolRevenue() external onlyOwner nonReentrant {
        uint256 amount = protocolRevenue;
        protocolRevenue = 0;
        _safeCusdTransfer(owner(), amount);
    }

    /**
     * @notice Withdraw accumulated weekly reward pool.
     */
    function withdrawWeeklyRewardPool(address to) external onlyOwner nonReentrant {
        uint256 amount = weeklyRewardPool;
        weeklyRewardPool = 0;
        _safeCusdTransfer(to, amount);
    }

    function _safeCusdTransfer(address to, uint256 amount) internal {
        if (amount > 0) {
            IERC20(USDC).safeTransfer(to, amount);
        }
    }
}
