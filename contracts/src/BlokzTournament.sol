// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IBlokzGame {
    function usernames(address player) external view returns (string memory);
}

/**
 * @title BlokzTournament
 * @notice Secured, upgradeable tournament manager with EIP-712 anti-cheat and emergency controls.
 */
contract BlokzTournament is 
    Initializable, 
    AccessControlUpgradeable, 
    ReentrancyGuard, 
    PausableUpgradeable, 
    EIP712Upgradeable, 
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ────────────────────────────────────────────────────────── Roles & Constants ──

    bytes32 public constant TOURNAMENT_ORGANIZER = keccak256("TOURNAMENT_ORGANIZER");
    bytes32 public constant TRUSTED_SIGNER = keccak256("TRUSTED_SIGNER");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    address public USDC;
    IBlokzGame public legacyGame;

    // EIP-712 Type Hashes
    bytes32 private constant START_GAME_TYPEHASH = keccak256(
        "StartGame(address player,uint256 tournamentId,bytes32 seedHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant SUBMIT_SCORE_TYPEHASH = keccak256(
        "SubmitScore(address player,uint256 tournamentId,uint256 gameId,uint32 score,uint256 deadline)"
    );

    // ────────────────────────────────────────────────────────────── State Vars ──

    enum GameStatus { ACTIVE, SUBMITTED, REJECTED }

    struct Game {
        address player;
        uint256 tournamentId;
        bytes32 seedHash;
        uint32 score;
        uint64 startedAt;
        uint64 submittedAt;
        GameStatus status;
    }

    struct LeaderboardEntry {
        address player;
        uint32 score;
        string username;
    }

    struct Tournament {
        address creator;
        uint256 entryFee;
        uint64 startTime;
        uint64 endTime;
        uint8 maxPlayers;
        uint8 playerCount;
        bool finalized;
        uint256 prizePool;
        uint16[] rewardsBps; 
    }

    uint256 public nextTournamentId;
    uint256 public nextGameId;
    uint16 public protocolFeeBps; // Payout fee in Basis Points
    
    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => Game) public games;
    mapping(address => uint256) public userNonces;
    mapping(uint256 => mapping(address => uint32)) public tournamentScores;
    mapping(uint256 => mapping(address => bool)) public inTournament;
    mapping(uint256 => address[]) internal _tournamentPlayers;
    mapping(address => uint256) public activeGame;
    mapping(bytes32 => bool) public usedSignatures;

    uint256 public protocolRevenue;

    // ────────────────────────────────────────────────────────────────── Events ──

    event TournamentCreated(uint256 indexed tid, address indexed creator, uint256 fee);
    event TournamentJoined(uint256 indexed tid, address indexed player);
    event TournamentGameStarted(uint256 indexed tid, uint256 indexed gid, address indexed player);
    event TournamentScoreSubmitted(uint256 indexed tid, uint256 indexed gid, address indexed player, uint32 score);
    event TournamentFinalized(uint256 indexed tid, uint256 totalPrize);
    event RewardPaid(uint256 indexed tid, address indexed player, uint256 amount);
    event FeeUpdated(uint16 oldFee, uint16 newFee);

    // ────────────────────────────────────────────────────────────────── Errors ──

    error InvalidTournamentParams();
    error TournamentNotFound();
    error TournamentFull();
    error AlreadyInTournament();
    error TournamentAlreadyEnded();
    error TournamentNotStarted();
    error TournamentNotOver();
    error TournamentAlreadyFinalized();
    error NotInTournament();
    error InvalidSignature();
    error SignatureExpired();
    error SignatureAlreadyUsed();
    error InvalidNonce();
    error GameNotActive();
    error NotGameOwner();
    error InvalidGameContext();
    error FeeTooHigh();
    error ExceedsMaxPlayers();

    uint8 public constant MAX_PLAYERS_LIMIT = 100;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _legacyGame, 
        address _usdc, 
        address admin, 
        address signer
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __EIP712_init("BlokzTournament", "1");

        legacyGame = IBlokzGame(_legacyGame);
        USDC = _usdc;
        protocolFeeBps = 1000; // Default 10%

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOURNAMENT_ORGANIZER, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(TRUSTED_SIGNER, signer);
        
        nextTournamentId = 1;
        nextGameId = 1;
    }

    // ────────────────────────────────────────────────────── Admin Operations ──

    function createTournament(
        uint256 fee,
        uint64 start,
        uint64 end,
        uint8 max,
        uint16[] calldata rewardsBps
    ) external whenNotPaused onlyRole(TOURNAMENT_ORGANIZER) returns (uint256 tid) {
        if (start <= block.timestamp || end <= start || max < 2) revert InvalidTournamentParams();
        if (max > MAX_PLAYERS_LIMIT) revert ExceedsMaxPlayers();
        
        uint256 totalBps = 0;
        for (uint256 i = 0; i < rewardsBps.length; i++) {
            totalBps += rewardsBps[i];
        }
        if (totalBps > 10000) revert InvalidTournamentParams();

        tid = nextTournamentId++;
        tournaments[tid] = Tournament({
            creator: msg.sender,
            entryFee: fee,
            startTime: start,
            endTime: end,
            maxPlayers: max,
            playerCount: 0,
            finalized: false,
            prizePool: 0,
            rewardsBps: rewardsBps
        });

        emit TournamentCreated(tid, msg.sender, fee);
    }

    function setProtocolFee(uint16 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFee > 2000) revert FeeTooHigh();
        emit FeeUpdated(protocolFeeBps, newFee);
        protocolFeeBps = newFee;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ────────────────────────────────────────────────────── Player Operations ──

    function joinTournament(uint256 tid) external whenNotPaused nonReentrant {
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

    function startTournamentGame(
        uint256 tid,
        bytes32 seedHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused returns (uint256 gid) {
        if (!inTournament[tid][msg.sender]) revert NotInTournament();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (nonce != userNonces[msg.sender]++) revert InvalidNonce();

        Tournament storage t = tournaments[tid];
        if (block.timestamp < t.startTime) revert TournamentNotStarted();
        if (block.timestamp > t.endTime) revert TournamentAlreadyEnded();

        bytes32 structHash = keccak256(abi.encode(START_GAME_TYPEHASH, msg.sender, tid, seedHash, nonce, deadline));
        if (usedSignatures[structHash]) revert SignatureAlreadyUsed();
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        if (!hasRole(TRUSTED_SIGNER, signer)) revert InvalidSignature();

        usedSignatures[structHash] = true;
        gid = nextGameId++;
        games[gid] = Game({
            player: msg.sender,
            tournamentId: tid,
            seedHash: seedHash,
            score: 0,
            startedAt: uint64(block.timestamp),
            submittedAt: 0,
            status: GameStatus.ACTIVE
        });
        activeGame[msg.sender] = gid;

        emit TournamentGameStarted(tid, gid, msg.sender);
    }

    function submitTournamentScore(
        uint256 tid,
        uint256 gid,
        uint32 score,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        if (block.timestamp > deadline) revert SignatureExpired();
        
        bytes32 structHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, msg.sender, tid, gid, score, deadline));
        if (usedSignatures[structHash]) revert SignatureAlreadyUsed();

        Game storage g = games[gid];
        if (g.tournamentId != tid) revert InvalidGameContext();
        if (g.player != msg.sender) revert NotGameOwner();
        if (g.status != GameStatus.ACTIVE) revert GameNotActive();

        Tournament storage t = tournaments[tid];
        if (block.timestamp > t.endTime) revert TournamentAlreadyEnded();

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        if (!hasRole(TRUSTED_SIGNER, signer)) revert InvalidSignature();

        usedSignatures[structHash] = true;
        g.score = score;
        g.status = GameStatus.SUBMITTED;
        g.submittedAt = uint64(block.timestamp);
        activeGame[msg.sender] = 0;

        if (score > tournamentScores[tid][msg.sender]) {
            tournamentScores[tid][msg.sender] = score;
        }

        emit TournamentScoreSubmitted(tid, gid, msg.sender, score);
    }

    // ────────────────────────────────────────────────────── Finalization ──

    function finalizeTournament(uint256 tid) external nonReentrant {
        Tournament storage t = tournaments[tid];
        if (t.creator == address(0)) revert TournamentNotFound();
        if (t.finalized) revert TournamentAlreadyFinalized();
        if (block.timestamp <= t.endTime) revert TournamentNotOver();

        t.finalized = true;
        address[] memory players = _tournamentPlayers[tid];
        uint256 pool = t.prizePool;
        
        if (players.length == 0 || pool == 0) {
            emit TournamentFinalized(tid, 0);
            return;
        }

        uint256 fee = (pool * protocolFeeBps) / 10000;
        protocolRevenue += fee;
        uint256 distributablePool = pool - fee;

        uint256 winnerCount = t.rewardsBps.length;
        address[] memory sorted = _sortTopPlayers(tid, players, winnerCount);
        
        for (uint256 i = 0; i < winnerCount && i < sorted.length; i++) {
            uint256 reward = (distributablePool * t.rewardsBps[i]) / 10000;
            if (reward > 0) {
                IERC20(USDC).safeTransfer(sorted[i], reward);
                emit RewardPaid(tid, sorted[i], reward);
            }
        }

        emit TournamentFinalized(tid, pool);
    }

    // ────────────────────────────────────────────────────── View Helpers ──

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getUsername(address player) public view returns (string memory) {
        return legacyGame.usernames(player);
    }

    function getTournamentLeaderboard(uint256 tid) external view returns (LeaderboardEntry[] memory) {
        address[] memory players = _tournamentPlayers[tid];
        if (players.length == 0) return new LeaderboardEntry[](0);

        address[] memory playersCopy = new address[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            playersCopy[i] = players[i];
        }

        address[] memory sorted = _sortTopPlayers(tid, playersCopy, playersCopy.length);
        LeaderboardEntry[] memory leaderboard = new LeaderboardEntry[](sorted.length);

        for (uint256 i = 0; i < sorted.length; i++) {
            address p = sorted[i];
            leaderboard[i] = LeaderboardEntry({
                player: p,
                score: tournamentScores[tid][p],
                username: getUsername(p)
            });
        }

        return leaderboard;
    }

    function _sortTopPlayers(uint256 tid, address[] memory p, uint256 topN) internal view returns (address[] memory) {
        uint256 n = p.length;
        if (topN > n) topN = n;
        
        for (uint256 i = 0; i < topN; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (tournamentScores[tid][p[j]] > tournamentScores[tid][p[maxIdx]]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                (p[i], p[maxIdx]) = (p[maxIdx], p[i]);
            }
        }
        return p;
    }

    function withdrawProtocolRevenue(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 amount = protocolRevenue;
        protocolRevenue = 0;
        IERC20(USDC).safeTransfer(to, amount);
    }
}
