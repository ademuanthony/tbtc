import * as ethers from 'ethers';
import { TBTC } from '@keep-network/tbtc-v2.ts';

require('dotenv').config();
const prompt = require('prompt-sync')();

// Create an Ethers provider. Pass the URL of an Ethereum mainnet node.
// For example, Alchemy or Infura.
const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
// Create an Ethers signer. Pass the private key and the above provider.
const signer = new ethers.Wallet(process.env.ETH_PRIV_KEY as string, provider);

// If you want to initialize the SDK just for read-only actions, it is
// enough to pass the provider.
const sdkReadonly = await TBTC.initializeMainnet(provider);
// If you want to make transactions as well, you have to pass the signer.
const sdk =
  process.env.NETWORK == 'testnet'
    ? await TBTC.initializeMainnet(signer)
    : await TBTC.initializeSepolia(signer);

console.log('Welcome! I will guide you through the process of minting TBTC.');
console.log('What do you want to do?');

const mainAction = par
