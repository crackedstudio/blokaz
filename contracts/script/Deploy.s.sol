// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BlokzGame} from "../src/BlokzGame.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deploying BlokzGame...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        // Deploy implementation
        BlokzGame impl = new BlokzGame();
        console.log("Implementation:", address(impl));

        // Encode initializer call
        bytes memory initData = abi.encodeCall(BlokzGame.initialize, (deployer));

        // Deploy UUPS proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("Proxy (BlokzGame):", address(proxy));

        vm.stopBroadcast();

        // Verify the proxy is wired correctly
        BlokzGame game = BlokzGame(address(proxy));
        require(game.owner() == deployer, "owner mismatch");
        console.log("Owner:", game.owner());
        console.log("CUSD:", game.CUSD());
        console.log("Deploy complete.");
    }
}
