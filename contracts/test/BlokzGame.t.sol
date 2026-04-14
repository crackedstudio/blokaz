// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlokzGame} from "../src/BlokzGame.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ─────────────────────────────────────────────────── Mock cUSD ERC-20 ──

contract MockERC20 is Test {
    string public name = "Mock cUSD";
    string public symbol = "mCUSD";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ─────────────────────────────────────────────────── Exposed subclass ──

/// @dev Exposes internals for testing.
contract BlokzGameExposed is BlokzGame {
    MockERC20 public mockCusd;

    function setCusdMock(address mock) external {
        mockCusd = MockERC20(mock);
    }

    // Override CUSD constant behaviour by overriding the transfer helper in tests.
    // We use vm.mockCall in the test instead — no override needed.
}

// ──────────────────────────────────────────────────────────── Tests ──

contract BlokzGameTest is Test {
    BlokzGame public game;
    MockERC20 public cusd;
    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    function setUp() public {
        // Deploy mock cUSD
        cusd = new MockERC20();

        // Deploy implementation + proxy
        BlokzGame impl = new BlokzGame();
        bytes memory initData = abi.encodeCall(BlokzGame.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        game = BlokzGame(address(proxy));

        // Fund players with mock cUSD
        cusd.mint(alice, 1000 ether);
        cusd.mint(bob, 1000 ether);
        cusd.mint(carol, 1000 ether);
    }

    // ─────────────────────────────────── Task 3.2: Game Registry tests ──

    function test_startGame_createsActiveGame() public {
        vm.prank(alice);
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seedHash = keccak256(abi.encodePacked(bytes32("seed"), alice));
        uint256 gameId = game.startGame(seedHash);

        (address player,,,,, BlokzGame.GameStatus status) = game.games(gameId);
        assertEq(player, alice, "player mismatch");
        assertEq(uint8(status), uint8(BlokzGame.GameStatus.ACTIVE), "should be ACTIVE");
        assertEq(game.activeGame(alice), gameId, "activeGame mismatch");
        assertEq(gameId, 1, "first gameId should be 1");
    }

    function test_startGame_cannotHaveTwoActiveGames() public {
        vm.startPrank(alice);
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seedHash = keccak256(abi.encodePacked(bytes32("seed"), alice));
        game.startGame(seedHash);

        vm.expectRevert(BlokzGame.AlreadyHasActiveGame.selector);
        game.startGame(seedHash);
        vm.stopPrank();
    }

    function test_submitScore_withValidSeed() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seed = bytes32("myseed");
        bytes32 seedHash = keccak256(abi.encodePacked(seed, alice));

        vm.prank(alice);
        uint256 gameId = game.startGame(seedHash);

        // Build a minimal packed moves array (1 move: pieceIndex=0, row=0, col=0)
        // 10 bits per move, 25 per word: bits = 0b00_0000_0000 = 0
        uint256[] memory packed = new uint256[](1);
        packed[0] = 0; // all zeros → move (0,0,0)

        vm.prank(alice);
        game.submitScore(gameId, seed, packed, 100, 1);

        (,,uint32 score,,,BlokzGame.GameStatus status) = game.games(gameId);
        assertEq(score, 100, "score mismatch");
        assertEq(uint8(status), uint8(BlokzGame.GameStatus.SUBMITTED), "should be SUBMITTED");
        assertEq(game.activeGame(alice), 0, "activeGame should clear");
    }

    function test_submitScore_wrongSeedReverts() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seed = bytes32("realseed");
        bytes32 seedHash = keccak256(abi.encodePacked(seed, alice));

        vm.prank(alice);
        uint256 gameId = game.startGame(seedHash);

        uint256[] memory packed = new uint256[](1);
        vm.prank(alice);
        vm.expectRevert(BlokzGame.InvalidSeed.selector);
        // forge-lint: disable-next-line(unsafe-typecast)
        game.submitScore(gameId, bytes32("wrongseed"), packed, 100, 0);
    }

    function test_submitScore_onlyOwnerCanSubmit() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seed = bytes32("s");
        bytes32 seedHash = keccak256(abi.encodePacked(seed, alice));
        vm.prank(alice);
        uint256 gameId = game.startGame(seedHash);

        uint256[] memory packed = new uint256[](1);
        vm.prank(bob);
        vm.expectRevert(BlokzGame.NotGameOwner.selector);
        game.submitScore(gameId, seed, packed, 50, 0);
    }

    function test_canStartNewGameAfterSubmitting() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seed = bytes32("s");
        bytes32 seedHash = keccak256(abi.encodePacked(seed, alice));

        vm.prank(alice);
        uint256 gameId = game.startGame(seedHash);

        uint256[] memory packed = new uint256[](1);
        vm.prank(alice);
        game.submitScore(gameId, seed, packed, 100, 0);

        // Should be able to start a new game
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seedHash2 = keccak256(abi.encodePacked(bytes32("seed2"), alice));
        vm.prank(alice);
        uint256 gameId2 = game.startGame(seedHash2);
        assertEq(gameId2, gameId + 1);
    }

    // ──────────────────────────────── Task 3.4: Leaderboard tests ──

    function test_leaderboard_sortedDescending() public {
        _submitGameWithScore(alice, 500);
        _submitGameWithScore(bob, 200);
        _submitGameWithScore(carol, 350);

        uint256 epoch = game.getCurrentEpoch();
        BlokzGame.LeaderboardEntry[] memory board = game.getLeaderboard(epoch);

        assertEq(board.length, 3);
        assertEq(board[0].score, 500, "1st should be 500");
        assertEq(board[1].score, 350, "2nd should be 350");
        assertEq(board[2].score, 200, "3rd should be 200");
    }

    function test_leaderboard_lowestReplacedWhenFull() public {
        // Fill leaderboard with 50 entries at score=100
        address[] memory players = new address[](50);
        for (uint256 i = 0; i < 50; i++) {
            address p = makeAddr(string(abi.encodePacked("player", i)));
            players[i] = p;
            _submitGameWithScore(p, 100);
        }

        uint256 epoch = game.getCurrentEpoch();
        BlokzGame.LeaderboardEntry[] memory before = game.getLeaderboard(epoch);
        assertEq(before.length, 50);
        assertEq(before[49].score, 100);

        // A higher score should replace the lowest
        address newPlayer = makeAddr("newPlayer");
        _submitGameWithScore(newPlayer, 150);

        BlokzGame.LeaderboardEntry[] memory after_ = game.getLeaderboard(epoch);
        assertEq(after_.length, 50);
        assertEq(after_[0].score, 150, "new player should be first");
        assertEq(after_[49].score, 100, "last should still be 100");
    }

    function test_leaderboard_lowScoreNotReplaced() public {
        _submitGameWithScore(alice, 500);
        _submitGameWithScore(bob, 400);
        // Fill to 50 with scores >= 300
        for (uint256 i = 0; i < 48; i++) {
            address p = makeAddr(string(abi.encodePacked("p", i)));
            _submitGameWithScore(p, 300);
        }
        // Submitting a lower score should not add to leaderboard
        _submitGameWithScore(carol, 50);
        uint256 epoch = game.getCurrentEpoch();
        BlokzGame.LeaderboardEntry[] memory board = game.getLeaderboard(epoch);
        assertEq(board.length, 50);
        // lowest entry should still be 300
        assertEq(board[49].score, 300);
    }

    function test_differentEpochsAreIndependent() public {
        _submitGameWithScore(alice, 999);

        uint256 epoch = game.getCurrentEpoch();
        BlokzGame.LeaderboardEntry[] memory board1 = game.getLeaderboard(epoch);
        BlokzGame.LeaderboardEntry[] memory board2 = game.getLeaderboard(epoch + 1);

        assertEq(board1.length, 1);
        assertEq(board2.length, 0, "next epoch should be empty");
    }

    // ─────────────────────────────── Task 3.5: Tournament tests ──

    function _mockCusd() internal {
        // Replace CUSD calls with our mock
        vm.mockCall(
            game.CUSD(),
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        vm.mockCall(
            game.CUSD(),
            abi.encodeWithSelector(IERC20.transfer.selector),
            abi.encode(true)
        );
    }

    function test_tournament_fullLifecycle() public {
        _mockCusd();
        uint256 entryFee = 1 ether;
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 days);

        vm.prank(alice);
        uint256 tid = game.createTournament(entryFee, start, end, 4);
        assertEq(tid, 0, "first tournament id = 0");

        // Join
        vm.prank(alice);
        game.joinTournament(tid);
        vm.prank(bob);
        game.joinTournament(tid);
        vm.prank(carol);
        game.joinTournament(tid);

        (,,,,, uint8 playerCount,,) = game.tournaments(tid);
        assertEq(playerCount, 3);

        // Submit scores (no moves needed, zero moveCount skips spot-check)
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 seed = bytes32("seed");
        uint256[] memory packed = new uint256[](1);

        vm.prank(alice);
        game.submitTournamentScore(tid, seed, packed, 800, 0);
        vm.prank(bob);
        game.submitTournamentScore(tid, seed, packed, 500, 0);
        vm.prank(carol);
        game.submitTournamentScore(tid, seed, packed, 650, 0);

        assertEq(game.tournamentScores(tid, alice), 800);
        assertEq(game.tournamentScores(tid, carol), 650);
        assertEq(game.tournamentScores(tid, bob), 500);

        // Finalize
        vm.warp(end + 1);
        game.finalizeTournament(tid);

        (,,,,,, bool finalized,) = game.tournaments(tid);
        assertTrue(finalized);
    }

    function test_tournament_cannotJoinAfterEnd() public {
        _mockCusd();
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 hours);

        vm.prank(alice);
        uint256 tid = game.createTournament(1 ether, start, end, 4);

        vm.warp(end + 1);
        vm.prank(bob);
        vm.expectRevert(BlokzGame.TournamentAlreadyStarted.selector);
        game.joinTournament(tid);
    }

    function test_tournament_cannotJoinTwice() public {
        _mockCusd();
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 days);

        vm.prank(alice);
        uint256 tid = game.createTournament(0, start, end, 4);

        vm.prank(alice);
        game.joinTournament(tid);

        vm.prank(alice);
        vm.expectRevert(BlokzGame.AlreadyInTournament.selector);
        game.joinTournament(tid);
    }

    function test_tournament_cannotFinalizeBeforeEnd() public {
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 days);

        vm.prank(alice);
        uint256 tid = game.createTournament(0, start, end, 4);

        vm.expectRevert(BlokzGame.TournamentNotOver.selector);
        game.finalizeTournament(tid);
    }

    function test_tournament_cannotFinalizeTwice() public {
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 hours);

        vm.prank(alice);
        uint256 tid = game.createTournament(0, start, end, 4);

        vm.warp(end + 1);
        game.finalizeTournament(tid);

        vm.expectRevert(BlokzGame.TournamentAlreadyFinalized.selector);
        game.finalizeTournament(tid);
    }

    function test_tournament_maxPlayersEnforced() public {
        _mockCusd();
        uint64 start = uint64(block.timestamp + 60);
        uint64 end = uint64(block.timestamp + 1 days);

        vm.prank(alice);
        uint256 tid = game.createTournament(0, start, end, 2);

        vm.prank(alice);
        game.joinTournament(tid);
        vm.prank(bob);
        game.joinTournament(tid);

        vm.prank(carol);
        vm.expectRevert(BlokzGame.TournamentFull.selector);
        game.joinTournament(tid);
    }

    // ─────────────────────────────────────────── Helpers ──

    function _submitGameWithScore(address player, uint32 score) internal {
        bytes32 seed = keccak256(abi.encodePacked(player, score));
        bytes32 seedHash = keccak256(abi.encodePacked(seed, player));

        vm.prank(player);
        uint256 gameId = game.startGame(seedHash);

        uint256[] memory packed = new uint256[](1);
        vm.prank(player);
        game.submitScore(gameId, seed, packed, score, 0);
    }
}
