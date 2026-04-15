// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {BlokzGame} from "../src/BlokzGame.sol";

contract DeployBlokzGame is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        BlokzGame game = new BlokzGame(vm.addr(deployerPrivateKey));

        vm.stopBroadcast();
    }
}
