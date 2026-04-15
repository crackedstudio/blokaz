// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";

contract HashSimple is Test {
    function testSimple() public {
        bytes32 seed = 0x664152c596f44ddfd33847ccd2024d0f8727dfc43c1a0569e564ab5f3b42950e;
        bytes32 solHash = keccak256(abi.encodePacked(seed));
        console.log("Simple Hash:");
        console.logBytes32(solHash);
    }
}
