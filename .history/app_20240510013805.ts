import * as ethers from 'ethers';
import { TBTC } from '@keep-network/tbtc-v2.ts';

require('dotenv').config();
const prompt = require('prompt-sync')();
const fs = require('fs');



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

export const saveMint = async (mint: Mint) => {
  const objStr = JSON.stringify(mint, null, 2);
  await fs.writeFileSync(`./.data/${mint.label}.json`, objStr);
};

export const loadMint = async (label: string) => {
  const filePath = `./.data/${label}.json`;
  const objStr = fs.readFileSync(filePath, 'utf-8');
  if (objStr == '') return null;
  const mint = JSON.parse(objStr) as Mint;

  return mint;
};

const initiateNewMint = async () => {
  console.log('Please enter a unique label for this process');
  const mint = {} as Mint;
  mint.label = prompt('Label: ');
  const oldMint = await loadMint(mint.label);
  if (oldMint) {
    console.log('Error: A mint with the specified label already exists')
    return;
  }
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

  console.log('Catching mint info for future reference')
  await saveMint(mint)

  console.log('\n\n')
  console.log('Please send BTC to the following address')
  console.log(mint.bitcoinDepositAddress)
};

main();
