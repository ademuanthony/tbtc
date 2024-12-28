import * as ethers from 'ethers';
import { Deposit, TBTC } from '@keep-network/tbtc-v2.ts';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as fs from 'fs';

require('dotenv').config();
const prompt = require('prompt-sync')();

const main = async () => {
  console.log('Welcome! I will guide you through the process of minting TBTC.');
  console.log('What do you want to do?');
  console.log(`
1: Initiate new mint
2: Recorver BTC for failed transaction
3: Unmint TBTC`);

  const mainAction = parseInt(prompt('Enter 1, 2, or 3: '));

  switch (mainAction) {
    case 1:
      await initiateNewMint();
      return;
  }
};

type Mint = {
  label: string;
  bitcoinRecoveryAddress: string;
  bitcoinRecoveryAddressPrivKey: string;
  etherSignerPrivKey: string;
  bitcoinDepositAddress: string;
  TxHash: string;
  status: string;
};

export const saveMint = async (mint: Mint) => {
  const objStr = JSON.stringify(mint, null, 2);
  fs.writeFileSync(`./.data/${mint.label}.json`, objStr);
};

export const loadMint = async (label: string) => {
  try {
    const filePath = `./.data/${label}.json`;
    const objStr = fs.readFileSync(filePath, 'utf-8');
    if (objStr == '') return null;
    const mint = JSON.parse(objStr) as Mint;

    return mint;
  } catch (error) {
    return null;
  }
};

const initiateNewMint = async () => {
  console.log('Please enter a unique label for this process');
  const mint = { status: 'new' } as Mint;
  mint.label = prompt('Label: ');
  const oldMint = await loadMint(mint.label);
  if (oldMint) {
    console.log('Error: A mint with the specified label already exists');
    return;
  }

  console.log('Enter the private key of your ether signer');
  mint.etherSignerPrivKey = prompt('Ether Signer: ');

  console.log('Generating recovery address...');
  const ECPair = ECPairFactory(ecc);
  const keyPair = ECPair.makeRandom();
  const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });
  mint.bitcoinRecoveryAddress = address as string;
  mint.bitcoinRecoveryAddressPrivKey = keyPair.privateKey?.toString(
    'hex'
  ) as string;
  console.log(`Bitcoin recovery address: ${address}`);

  console.log('Generating deposit address...');

  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(mint.etherSignerPrivKey, provider);

  const sdk =
    process.env.NETWORK == 'testnet'
      ? await TBTC.initializeMainnet(signer)
      : await TBTC.initializeSepolia(signer);

  const deposit = await sdk.deposits.initiateDeposit(
    mint.bitcoinRecoveryAddress
  );

  try {
    // Take the Bitcoin deposit address. BTC must be sent here.
    mint.bitcoinDepositAddress = await deposit.getBitcoinAddress();
  } catch (error) {
    console.log(error);
  }

  mint.status = 'address created';

  console.log('Catching mint info for future reference');
  await saveMint(mint);

  console.log('\n');
  await triggerMint(sdk, mint, deposit);
};

async function triggerMint(sdk: TBTC, mint: Mint, deposit: Deposit) {
  console.log(
    'Please send BTC to the following address and press enter to continue'
  );
  console.log(mint.bitcoinDepositAddress);

  prompt('');
  try {
    const txHash = await deposit.initiateMinting();
    console.log(`Mint initiated. TxHash: \n${txHash}`);
  } catch (error) {
    console.log(error);
    console.log(
      'Unable to initiate mint. Make sure to send BTC to the deposit and press enter to try again'
    );
    await triggerMint(sdk, mint, deposit);
  }
}

const recoverBtc = async () => {};

const unmint = async () => {
  console.log('Enter the private key of your ether signer');
  const etherSignerPrivKey = prompt('Ether Signer: ');

  console.log('Enter P2WPKH/P2PKH or P2WSH/P2SH Bitcoin redeemer address');
  const bitcoinRedeemerAddress = prompt('BTC address: ');
};

main();
