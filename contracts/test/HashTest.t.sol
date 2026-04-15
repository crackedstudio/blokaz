// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";

contract HashTest is Test {
    function testSpecific() public {
        bytes32 seed = 0x1234567812345678123456781234567812345678123456781234567812345678;
        address player = 0xd5881AA749eEFd3Cb08d10f051aC776d664d0663;
        bytes32 solHash = keccak256(abi.encodePacked(seed, player));
        console.log("Solidity Hash:");
        console.logBytes32(solHash);
    }
}
