import * as ethers from 'ethers';
import { TBTC } from '@keep-network/tbtc-v2.ts';

require('dotenv').config();
const prompt = require('prompt-sync')();
const fs = require('fs')

const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
const signer = new ethers.Wallet(process.env.ETH_PRIV_KEY as string, provider);

const sdk =
  process.env.NETWORK == 'testnet'
    ? await TBTC.initializeMainnet(signer)
    : await TBTC.initializeSepolia(signer);

const main = async () => {
  console.log('Welcome! I will guide you through the process of minting TBTC.');
  console.log('What do you want to do?');
  console.log(`
1: Initiate new mint
2: Continue existing session
3: Recorver BTC for failed transaction
4: Unmint TBTC`);

  const mainAction = parseInt(prompt('Enter 1, 2, 3, or 4: '));

  switch (mainAction) {
    case 1:
      await initiateNewMint();
      return;
  }
};

type Mint = {
  label: string;
  bitcoinRecoveryAddress: string;
  ercSignerPrivKey: string;
  bitcoinDepositAddress: string;
};

export const saveMint = async (project: Mint) => {
 
  const updatedWalletString = JSON.stringify(project, null, 2)
  await fs.writeFileSync(`./.data/projects/${project.name}.json`, updatedWalletString)
}

export const loadMint = async (name: string) => {
  const filePath = `./.data/projects/${name}.json`
  const walletString = fs.readFileSync(filePath, 'utf-8')
  const project = JSON.parse(walletString) as Project

  return project
}

const initiateNewMint = async () => {
  console.log('Please enter a unique label for this process');
  const mint = {} as Mint;
  mint.label = prompt('Label: ');
  console.log('Enter BTC recovery address');
  mint.bitcoinRecoveryAddress = prompt('BTC recovery address: ');
  console.log('Enter the private key of your ether signer');
  mint.ercSignerPrivKey = prompt('Ether Signer: ');

  console.log('Generating deposit address...');

  const deposit = await sdk.deposits.initiateDeposit(
    mint.bitcoinRecoveryAddress
  );

  // Take the Bitcoin deposit address. BTC must be sent here.
  mint.bitcoinDepositAddress = await deposit.getBitcoinAddress();
};

main();
