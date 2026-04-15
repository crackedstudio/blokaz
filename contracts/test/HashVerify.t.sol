// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";

contract HashVerify is Test {
    function testVerify() public {
        bytes32 seed = 0x664152c596f44ddfd33847ccd2024d0f8727dfc43c1a0569e564ab5f3b42950e;
        address player = 0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC;
        bytes memory packed = abi.encodePacked(seed, player);
        console.log("Packed bytes:");
        console.logBytes(packed);
        bytes32 solHash = keccak256(packed);
        console.log("Hash:");
        console.logBytes32(solHash);
    }
}
