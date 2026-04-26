// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlokzTournament.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}

contract MockGame is IBlokzGame {
    mapping(address => string) public override usernames;
    function setUsername(address player, string memory name) external {
        usernames[player] = name;
    }
}

contract BlokzTournamentTest is Test {
    BlokzTournament public tournament;
    MockUSDC public usdc;
    MockGame public game;
    
    address public admin = address(1);
    uint256 public signerKey = 0x1234;
    address public signer;
    address public player = address(3);
    
    bytes32 private constant START_GAME_TYPEHASH = keccak256(
        "StartGame(address player,uint256 tournamentId,bytes32 seedHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant SUBMIT_SCORE_TYPEHASH = keccak256(
        "SubmitScore(address player,uint256 tournamentId,uint256 gameId,uint32 score,uint256 deadline)"
    );

    function setUp() public {
        signer = vm.addr(signerKey);
        usdc = new MockUSDC();
        game = new MockGame();
        
        BlokzTournament implementation = new BlokzTournament();
        bytes memory data = abi.encodeWithSelector(
            BlokzTournament.initialize.selector,
            address(game),
            address(usdc),
            admin,
            signer
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), data);
        tournament = BlokzTournament(address(proxy));
        
        usdc.mint(player, 1000e6);
        vm.prank(player);
        usdc.approve(address(tournament), type(uint256).max);
    }

    function testCreateAndJoin() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000; // 100%
        
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 100), uint64(block.timestamp + 1000), 10, rewards);
        
        vm.prank(player);
        tournament.joinTournament(tid);
        
        (,,,,,,bool finalized,uint256 prizePool) = tournament.tournaments(tid);
        assertEq(prizePool, 10e6);
        assertEq(finalized, false);
    }

    function testStartGameWithSignature() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        
        vm.prank(player);
        tournament.joinTournament(tid);
        
        vm.warp(block.timestamp + 20);
        
        bytes32 seedHash = keccak256("seed");
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 60;
        
        bytes32 structHash = keccak256(abi.encode(START_GAME_TYPEHASH, player, tid, seedHash, nonce, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(player);
        uint256 gid = tournament.startTournamentGame(tid, seedHash, nonce, deadline, signature);
        
        assertEq(gid, 1);
        (address p, uint256 tId,,,,,) = tournament.games(gid);
        assertEq(p, player);
        assertEq(tId, tid);
    }

    function testSubmitScoreWithSignature() public {
        // First start game
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        vm.prank(player);
        tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);
        
        bytes32 seedHash = keccak256("seed");
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 60;
        bytes32 structHash = keccak256(abi.encode(START_GAME_TYPEHASH, player, tid, seedHash, nonce, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(player);
        uint256 gid = tournament.startTournamentGame(tid, seedHash, nonce, deadline, signature);

        // Submit Score
        uint32 score = 5000;
        uint256 submitDeadline = block.timestamp + 120;
        bytes32 submitStructHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, player, tid, gid, score, submitDeadline));
        bytes32 submitDigest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), submitStructHash);
        (v, r, s) = vm.sign(signerKey, submitDigest);
        bytes memory submitSignature = abi.encodePacked(r, s, v);
        
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid, score, submitDeadline, submitSignature);
        
        assertEq(tournament.tournamentScores(tid, player), score);
    }

    function test_RevertIf_InflatingScore() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        vm.prank(player);
        tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);
        
        // Start Game
        bytes32 seedHash = keccak256("seed");
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 60;
        bytes32 structHash = keccak256(abi.encode(START_GAME_TYPEHASH, player, tid, seedHash, nonce, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory startSig = abi.encodePacked(r, s, v);
        vm.prank(player);
        uint256 gid = tournament.startTournamentGame(tid, seedHash, nonce, deadline, startSig);

        // Server signs for 5,000
        uint32 actualScore = 5000;
        uint256 submitDeadline = block.timestamp + 120;
        bytes32 submitStructHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, player, tid, gid, actualScore, submitDeadline));
        bytes32 submitDigest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), submitStructHash);
        (v, r, s) = vm.sign(signerKey, submitDigest);
        bytes memory validSig = abi.encodePacked(r, s, v);

        // Player tries to submit 99,999 with the 5,000 signature -> REVERT
        vm.expectRevert(BlokzTournament.InvalidSignature.selector);
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid, 99999, submitDeadline, validSig);
    }

    function test_RevertIf_ReplayingSignature() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        vm.prank(player);
        tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);
        
        uint256 gid = _startGame(tid, player);

        uint32 score = 5000;
        uint256 deadline = block.timestamp + 120;
        bytes32 structHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, player, tid, gid, score, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // First submission -> SUCCESS
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid, score, deadline, sig);

        // Second submission with same signature -> REVERT (SignatureAlreadyUsed)
        vm.expectRevert(BlokzTournament.SignatureAlreadyUsed.selector);
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid, score, deadline, sig);
    }

    function test_RevertIf_SignatureBorrowedFromAnotherGame() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        vm.prank(player);
        tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);
        
        uint256 gid1 = _startGame(tid, player);
        uint256 gid2 = _startGame(tid, player); // next nonce is 1

        // Server signs for Game #1
        uint32 score = 5000;
        uint256 deadline = block.timestamp + 120;
        bytes32 structHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, player, tid, gid1, score, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sigGid1 = abi.encodePacked(r, s, v);

        // Player tries to use Game #1 signature for Game #2 -> REVERT
        vm.expectRevert(BlokzTournament.InvalidSignature.selector);
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid2, score, deadline, sigGid1);
    }

    // Helper to start a game easily in tests
    function _startGame(uint256 tid, address p) internal returns (uint256) {
        bytes32 seedHash = keccak256(abi.encodePacked("seed", p));
        uint256 nonce = tournament.userNonces(p);
        uint256 deadline = block.timestamp + 60;
        bytes32 structHash = keccak256(abi.encode(START_GAME_TYPEHASH, p, tid, seedHash, nonce, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        uint256 gid;
        vm.prank(p);
        gid = tournament.startTournamentGame(tid, seedHash, nonce, deadline, sig);
        return gid;
    }

    function test_RevertIf_InvalidSignature() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        vm.prank(player);
        tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);
        uint256 gid = _startGame(tid, player);

        // Submit with generic junk data instead of a real signature
        bytes memory junkSignature = abi.encodePacked(bytes32(0), bytes32(0), uint8(0));
        
        vm.expectRevert(); // ECDSA: invalid signature 'v' etc
        vm.prank(player);
        tournament.submitTournamentScore(tid, gid, 5000, block.timestamp + 60, junkSignature);
    }

    function test_RevertIf_ManipulatingOthersGame() public {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        uint256 tid = tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        
        address playerA = address(0xAA);
        address playerB = address(0xBB);
        usdc.mint(playerA, 100e6);
        usdc.mint(playerB, 100e6);
        
        vm.prank(playerA); usdc.approve(address(tournament), type(uint256).max);
        vm.prank(playerB); usdc.approve(address(tournament), type(uint256).max);
        
        vm.prank(playerA); tournament.joinTournament(tid);
        vm.prank(playerB); tournament.joinTournament(tid);
        vm.warp(block.timestamp + 20);

        uint256 gidA = _startGame(tid, playerA);
        uint256 gidB = _startGame(tid, playerB);

        // Player A gets a valid signature for THEIR game (gidA)
        uint32 scoreA = 5000;
        uint256 deadline = block.timestamp + 60;
        bytes32 structHash = keccak256(abi.encode(SUBMIT_SCORE_TYPEHASH, playerA, tid, gidA, scoreA, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(tournament.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sigA = abi.encodePacked(r, s, v);

        // Player A tries to use their valid signature but targeting Player B's game ID (gidB)
        vm.expectRevert(BlokzTournament.NotGameOwner.selector);
        vm.prank(playerA);
        tournament.submitTournamentScore(tid, gidB, scoreA, deadline, sigA);
    }

    function testSetFee() public {
        vm.prank(admin);
        tournament.setProtocolFee(1500); // 15%
        assertEq(tournament.protocolFeeBps(), 1500);
        
        vm.prank(admin);
        vm.expectRevert(BlokzTournament.FeeTooHigh.selector);
        tournament.setProtocolFee(2500); // 25% > 20%
    }

    function testPausing() public {
        vm.prank(admin);
        tournament.pause();
        
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        
        vm.prank(admin);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
        
        vm.prank(admin);
        tournament.unpause();
        
        vm.prank(admin);
        tournament.createTournament(10e6, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), 10, rewards);
    }

    // ────────────────────────────────────────────────────────── Storage Collision ──

    function testStorageCollisionAfterUpgrade() public {
        // 1. Setup V1 State
        vm.prank(admin);
        tournament.setProtocolFee(1234);
        
        uint256 tidV1 = _createTestTournament(10e6, 10);
        
        // 2. Deploy V2 Implementation
        BlokzTournamentV2 mockV2 = new BlokzTournamentV2();
        
        // 3. Upgrade
        vm.prank(admin);
        tournament.upgradeToAndCall(address(mockV2), "");
        
        // 4. Verify V1 state is preserved in V2 context
        assertEq(tournament.protocolFeeBps(), 1234);
        assertEq(tournament.USDC(), address(usdc));
        
        (,,uint64 startV1,,,,,) = tournament.tournaments(tidV1);
        assertEq(startV1, uint64(block.timestamp + 10));

        // 5. Verify V2 functionality works
        BlokzTournamentV2 v2 = BlokzTournamentV2(address(tournament));
        assertEq(v2.version(), "V2");
    }

    // ────────────────────────────────────────────────────────────── DOS / Scale ──

    function testScaleDOSLimit() public {
        // Test that 100 players (new MAX_PLAYERS_LIMIT) doesn't DOS
        uint8 maxLimit = 100;
        uint16[] memory rewards = new uint16[](3);
        rewards[0] = 5000; rewards[1] = 3000; rewards[2] = 2000;
        
        vm.prank(admin);
        uint256 tid = tournament.createTournament(
            1e6, 
            uint64(block.timestamp + 1), 
            uint64(block.timestamp + 100), 
            maxLimit, 
            rewards
        );

        // Batch join 100 players
        for (uint16 i = 0; i < maxLimit; i++) {
            address p = address(uint160(1000 + i));
            usdc.mint(p, 1e6);
            vm.prank(p);
            usdc.approve(address(tournament), 1e6);
            vm.prank(p);
            tournament.joinTournament(tid);
        }

        vm.warp(block.timestamp + 101); // End tournament

        // Finalize (This iterates over 100 players but only sorts for Top 3 winners)
        uint256 gasBefore = gasleft();
        tournament.finalizeTournament(tid);
        uint256 gasUsed = gasBefore - gasleft();
        
        console.log("Gas used for 100 player finalization (Top 3):", gasUsed);
        
        // With Selection Sort optimized for topN, this should be very cheap
        assertTrue(gasUsed < 1_000_000, "Gas usage still too high");

        // Leaderboard fetch check (View function still sorts full 100)
        BlokzTournament.LeaderboardEntry[] memory lb = tournament.getTournamentLeaderboard(tid);
        assertEq(lb.length, 100);
    }

    function _createTestTournament(uint256 fee, uint8 max) internal returns (uint256) {
        uint16[] memory rewards = new uint16[](1);
        rewards[0] = 10000;
        vm.prank(admin);
        return tournament.createTournament(fee, uint64(block.timestamp + 10), uint64(block.timestamp + 1000), max, rewards);
    }
}

// Simple V2 Mock for upgrade testing
contract BlokzTournamentV2 is BlokzTournament {
    function version() external pure returns (string memory) {
        return "V2";
    }
}
