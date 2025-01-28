import * as ethers from 'ethers';
import { Deposit, Hex, TBTC, DepositReceipt } from '@keep-network/tbtc-v2.ts';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

require('dotenv').config();
const prompt = require('prompt-sync')();

const FEE_RATES = {
  testnet: {
    default: 3500, // High rate for testnet to ensure confirmation
    urgent: 7500,
  },
  mainnet: {
    default: 15, // Normal priority
    urgent: 30, // High priority for stuck transactions
  },
};

// Helper function to get appropriate fee rate
function getFeeRate(urgent: boolean = false): number {
  const network = process.env.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
  return urgent ? FEE_RATES[network].urgent : FEE_RATES[network].default;
}

// Add USDC and TBTC token addresses
const TOKENS = {
  mainnet: {
    TBTC: '0x18084fbA666a33d37592fA2633fD49a74DD93a88',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  testnet: {
    TBTC: '0x517f2982701695D4E52f1ECFBEf3ba31Df470161',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
};

const UNIVERSAL_ROUTER_ADDRESSES = {
  mainnet: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2B7FAD',
  testnet: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2B7FAD', // Sepolia
};

const main = async () => {
  console.log('Welcome! I will guide you through the process of minting TBTC.');
  console.log('What do you want to do?');
  console.log(`
    1: Initiate new mint
    2: Resume existing mint
    3: Unmint TBTC
    4: Recover stuck transaction
    5: Request refund for deposit`);

  const mainAction = parseInt(prompt('Enter 1-5: '));

  switch (mainAction) {
    case 1:
      await initiateNewMint();
      return;

    case 2:
      await resumeMint();
      return;

    case 3:
      await unmint();
      return;

    case 4:
      await recoverStuckTransaction();
      return;

    case 5:
      console.log('Please enter the label of the mint to refund:');
      const label = prompt('Label: ');
      const mint = await loadMint(label);
      if (!mint) {
        console.log('Error: No mint found with the specified label');
        return;
      }
      await initiateRefund(mint);
      return;

    default:
      console.log('Invalid entry');
      return;
  }
};

type Mint = {
  label: string;
  bitcoinRecoveryAddress: string;
  bitcoinRecoveryAddressPrivKey: string;
  etherSignerPrivKey: string;
  bitcoinDepositAddress: string;
  bitcoinSendMethod?: 'bitcoin-cli' | 'manual';
  bitcoinAmount?: string;
  bitcoinTxHash?: string;
  mintTxHash?: Hex | string;
  depositReceipt?: DepositReceipt;
  refundInitiated?: boolean;
  status:
    | 'new'
    | 'address created'
    | 'bitcoin sent'
    | 'minted'
    | 'refunded'
    | 'failed';
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

  console.log('Reading ether signer private key from .env');
  mint.etherSignerPrivKey = process.env.ETH_PRIV_KEY as string; // prompt('Ether Signer: ');

  console.log('Generating recovery address...');
  const ECPair = ECPairFactory(ecc);
  const keyPair = ECPair.makeRandom();
  // Change from p2pkh to p2wpkh (native SegWit)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network:
      process.env.NETWORK === 'testnet'
        ? bitcoin.networks.testnet
        : bitcoin.networks.bitcoin,
  });
  mint.bitcoinRecoveryAddress = address as string;
  mint.bitcoinRecoveryAddressPrivKey = keyPair.privateKey?.toString(
    'hex'
  ) as string;
  console.log(`Bitcoin recovery address: ${address}`);

  console.log('Generating deposit address...');

  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(mint.etherSignerPrivKey, provider);

  const sdk =
    process.env.NETWORK != 'testnet'
      ? await TBTC.initializeMainnet(signer)
      : await TBTC.initializeSepolia(signer);

  const deposit = await sdk.deposits.initiateDeposit(
    mint.bitcoinRecoveryAddress
  );

  // Store deposit receipt
  mint.depositReceipt = deposit.getReceipt();

  try {
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

async function resumeMint() {
  console.log('Please enter the label of the mint you want to resume');
  const label = prompt('Label: ');

  const mint = await loadMint(label);
  if (!mint) {
    console.log('Error: No mint found with the specified label');
    return;
  }

  console.log('\nFound mint info:');
  console.log(`Bitcoin Deposit Address: ${mint.bitcoinDepositAddress}`);
  console.log(`Current Status: ${mint.status}`);

  if (mint.bitcoinTxHash) {
    console.log(`Bitcoin Transaction Hash: ${mint.bitcoinTxHash}`);
  }
  if (mint.mintTxHash) {
    console.log(`Mint Transaction Hash: ${mint.mintTxHash}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(mint.etherSignerPrivKey, provider);

  const sdk =
    process.env.NETWORK === 'testnet'
      ? await TBTC.initializeSepolia(signer)
      : await TBTC.initializeMainnet(signer);

  const deposit = await sdk.deposits.initiateDeposit(
    mint.bitcoinRecoveryAddress
  );

  await triggerMint(sdk, mint, deposit);
}

async function abandonTransaction(
  mint: Mint,
  execPromise: any
): Promise<boolean> {
  try {
    console.log('Attempting to abandon transaction...');
    await execPromise(`bitcoin-cli abandontransaction ${mint.bitcoinTxHash}`);
    console.log('Transaction abandoned successfully.');

    // Reset transaction hash but keep the amount
    const amount = mint.bitcoinAmount;
    mint.bitcoinTxHash = undefined;
    mint.status = 'address created';
    mint.bitcoinAmount = amount; // Preserve the amount for new transaction
    await saveMint(mint);
    return true;
  } catch (error) {
    console.log('Error abandoning transaction:', error);
    console.log('Transaction might not be eligible for abandonment.');
    return false;
  }
}

async function waitForTransactionConfirmation(
  txid: string,
  execPromise: any
): Promise<boolean> {
  console.log('\nWaiting for transaction confirmation...');
  let confirmations = 0;
  let attempts = 0;
  const maxAttempts = 60; // Will wait up to 60 minutes

  while (confirmations < 1 && attempts < maxAttempts) {
    try {
      const { stdout } = await execPromise(
        `bitcoin-cli gettransaction ${txid}`
      );
      const txInfo = JSON.parse(stdout);
      confirmations = txInfo.confirmations || 0;

      if (confirmations >= 1) {
        console.log('Transaction confirmed!');
        return true;
      }

      attempts++;
      if (attempts % 6 === 0) {
        // Every minute
        console.log(
          `Still waiting... (${Math.round(attempts / 6)} minutes elapsed)`
        );
        // Check mempool status
        try {
          const { stdout: mempoolInfo } = await execPromise(
            `bitcoin-cli getmempoolentry ${txid}`
          );
          const mempoolData = JSON.parse(mempoolInfo);
          console.log(
            `Current fee rate: ${
              mempoolData.fees.base / mempoolData.vsize
            } sat/vB`
          );
        } catch (e) {
          // Transaction might not be in mempool
          console.log('Error checking mempool status:', e);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between checks
    } catch (error) {
      console.log('Error checking transaction status:', error);
      return false;
    }
  }

  if (attempts >= maxAttempts) {
    console.log('\nTransaction still unconfirmed after 10 minutes.');
    console.log('You can:');
    console.log(
      '1. Continue waiting (the transaction will be processed automatically once confirmed)'
    );
    console.log('2. Try recovery options for faster confirmation');
    console.log(
      `3. Monitor the transaction: https://mempool.space/testnet/tx/${txid}`
    );
    return false;
  }

  return false;
}

async function bumpTransactionFee(
  mint: Mint,
  execPromise: any
): Promise<boolean> {
  try {
    console.log('Transaction is replaceable. Attempting to bump fee...');

    const { stdout: bumpResult } = await execPromise(
      `bitcoin-cli bumpfee ${mint.bitcoinTxHash} '{"fee_rate": ${getFeeRate(
        true
      )}}'`
    );
    const bumpData = JSON.parse(bumpResult);

    console.log('Fee bump successful!');
    console.log(`New transaction ID: ${bumpData.txid}`);

    // Update mint with new transaction ID
    mint.bitcoinTxHash = bumpData.txid;
    await saveMint(mint);

    // Wait for confirmation
    if (await waitForTransactionConfirmation(bumpData.txid, execPromise)) {
      return true;
    }
    return false;
  } catch (error) {
    console.log('Error bumping fee:', error);
    return false;
  }
}

async function replaceTransaction(
  mint: Mint,
  execPromise: any
): Promise<boolean> {
  // Try to abandon the existing transaction first
  console.log(
    '\nAttempting to abandon existing transaction before creating new one...'
  );
  await abandonTransaction(mint, execPromise);

  console.log('\nCreating new transaction with higher fees...');
  const amount = mint.bitcoinAmount || prompt('Amount in BTC: ');

  // Store amount if not already saved
  if (!mint.bitcoinAmount) {
    mint.bitcoinAmount = amount;
    await saveMint(mint);
  }

  // Create new transaction with much higher fees
  const command = `bitcoin-cli -named sendtoaddress \
address="${mint.bitcoinDepositAddress}" \
amount=${amount} \
fee_rate=${getFeeRate(true)} \
replaceable=true`;

  console.log(`\nExecuting command: ${command}\n`);

  try {
    const { stdout } = await execPromise(command);
    const newTxid = stdout.trim();

    console.log('New transaction created!');
    console.log(`New transaction ID: ${newTxid}`);

    // Update mint with new transaction ID
    mint.bitcoinTxHash = newTxid;
    mint.status = 'bitcoin sent';
    await saveMint(mint);

    // Wait for confirmation
    if (await waitForTransactionConfirmation(newTxid, execPromise)) {
      return true;
    }
    return false;
  } catch (error) {
    console.log('Error creating new transaction:', error);
    return false;
  }
}

async function recoverStuckTransaction() {
  console.log('Please enter the label of the mint with the stuck transaction:');
  const label = prompt('Label: ');

  const mint = await loadMint(label);
  if (!mint) {
    console.log('Error: No mint found with the specified label');
    return;
  }

  if (!mint.bitcoinTxHash) {
    console.log('Error: No Bitcoin transaction found for this mint');
    return;
  }

  console.log('\nFound mint info:');
  console.log(`Bitcoin Deposit Address: ${mint.bitcoinDepositAddress}`);
  console.log(`Current Status: ${mint.status}`);
  console.log(`Bitcoin Transaction Hash: ${mint.bitcoinTxHash}`);

  console.log('\nAttempting to recover stuck transaction...');

  try {
    // Check if RBF is possible
    const { stdout: txInfo } = await execPromise(
      `bitcoin-cli gettransaction ${mint.bitcoinTxHash}`
    );
    const txData = JSON.parse(txInfo);

    if (txData.bip125replaceable === 'yes') {
      if (await bumpTransactionFee(mint, execPromise)) {
        await continueMintingProcess(mint);
      }
    } else {
      console.log('\nTransaction is not replaceable.');
      console.log('Current options:');
      console.log('1. Wait for the transaction to confirm naturally');
      console.log(
        '2. Create a new transaction with higher fees to the same address'
      );
      console.log('   (Note: Both transactions might eventually confirm)');

      console.log(
        '\nWould you like to create a new transaction with higher fees? (y/n)'
      );
      const createNew =
        prompt('Create new transaction? ').toLowerCase() === 'y';

      if (createNew) {
        if (await replaceTransaction(mint, execPromise)) {
          await continueMintingProcess(mint);
        }
      } else {
        showWaitingOptions(mint);
      }
    }
  } catch (error) {
    handleRecoveryError(error, mint, execPromise);
  }
}

async function continueMintingProcess(mint: Mint) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(mint.etherSignerPrivKey, provider);

  const sdk =
    process.env.NETWORK === 'testnet'
      ? await TBTC.initializeSepolia(signer)
      : await TBTC.initializeMainnet(signer);

  const deposit = await sdk.deposits.initiateDeposit(
    mint.bitcoinRecoveryAddress
  );

  await triggerMint(sdk, mint, deposit);
}

function showWaitingOptions(mint: Mint) {
  console.log('\nOK, waiting for natural confirmation.');
  console.log('You can:');
  console.log('1. Wait for the transaction to confirm');
  console.log('2. Try recovery again later');
  console.log('3. Monitor the transaction on a testnet explorer:');
  console.log(`   https://mempool.space/testnet/tx/${mint.bitcoinTxHash}`);
}

async function handleRecoveryError(error: any, mint: Mint, execPromise: any) {
  console.log('Error during recovery:', error);
  console.log('\nRecovery options:');
  console.log('1. Wait for the transaction to confirm naturally');
  console.log('2. Try again with a different recovery method');
  console.log('3. Monitor the transaction on a testnet explorer:');
  console.log(`   https://mempool.space/testnet/tx/${mint.bitcoinTxHash}`);

  // Check mempool status
  try {
    const { stdout: mempoolInfo } = await execPromise(
      'bitcoin-cli getmempoolentry ' + mint.bitcoinTxHash
    );
    const mempoolData = JSON.parse(mempoolInfo);
    console.log('\nTransaction is still in mempool:');
    console.log(
      `Current fee rate: ${mempoolData.fees.base / mempoolData.vsize} sat/vB`
    );
    console.log(
      `Time in mempool: ${Math.round(
        (Date.now() / 2500 - mempoolData.time) / 60
      )} minutes`
    );
  } catch (e) {
    console.log('\nTransaction is not in local mempool. It might be:');
    console.log('- Confirmed (check block explorer)');
    console.log('- Dropped from the network');
    console.log('- Not yet propagated to your node');
  }
}

async function triggerMint(sdk: TBTC, mint: Mint, deposit: Deposit) {
  if (mint.status === 'minted') {
    console.log('This mint has already been completed!');
    return;
  }

  // Handle Bitcoin deposit if not done yet
  if (mint.status !== 'bitcoin sent') {
    console.log('Would you like me to send BTC using bitcoin-cli? (y/n)');
    const useBitcoinCli = prompt('Use bitcoin-cli: ').toLowerCase() === 'y';
    mint.bitcoinSendMethod = useBitcoinCli ? 'bitcoin-cli' : 'manual';

    if (useBitcoinCli) {
      console.log('Enter the amount of BTC to send');
      const amount = prompt('Amount in BTC: ');
      mint.bitcoinAmount = amount;

      const command = `bitcoin-cli -named sendtoaddress \
address="${mint.bitcoinDepositAddress}" \
amount=${amount} \
fee_rate=${getFeeRate()} \
replaceable=true`;

      console.log(`\nExecuting command: ${command}\n`);

      try {
        const { stdout } = await execPromise(command);
        const txid = stdout.trim();
        console.log(`Transaction initiated! TXID: ${txid}`);
        mint.bitcoinTxHash = txid;
        mint.status = 'bitcoin sent';
        await saveMint(mint);

        // Wait for confirmation
        if (!(await waitForTransactionConfirmation(txid, execPromise))) {
          return;
        }
      } catch (error) {
        console.log('Error executing bitcoin-cli command:', error);
        return;
      }
    } else {
      console.log('Please send BTC to this address:');
      console.log(mint.bitcoinDepositAddress);
      console.log(
        '\nIMPORTANT: Use a high fee rate (~2500 sat/vB) for testnet!'
      );

      console.log(
        '\nEnter the Bitcoin transaction hash when sent (or press enter to exit):'
      );
      const txHash = prompt('Bitcoin TxHash: ');
      if (!txHash) return;

      mint.bitcoinTxHash = txHash;
      mint.status = 'bitcoin sent';
      await saveMint(mint);

      if (!(await waitForTransactionConfirmation(txHash, execPromise))) {
        return;
      }
    }
  }

  // Attempt minting
  try {
    const txHash = await deposit.initiateMinting();
    console.log(`Mint initiated. TxHash: \n${txHash}`);

    mint.mintTxHash = txHash;
    mint.status = 'minted';
    await saveMint(mint);
  } catch (error) {
    console.log(error);
    console.log('Unable to initiate mint. Make sure:');
    console.log('1. BTC has been sent to the deposit address');
    console.log('2. Transaction has at least 1 confirmation');
    console.log('3. You have enough ETH for gas fees');

    console.log('\nWould you like to try again? (y/n)');
    const retry = prompt('Retry? ').toLowerCase() === 'y';
    if (retry) {
      await triggerMint(sdk, mint, deposit);
    }
  }
}

const unmint = async () => {
  console.log('Enter the private key of your ether signer');
  const etherSignerPrivKey = prompt('Ether Signer: ');

  console.log('Enter P2WPKH/P2PKH or P2WSH/P2SH Bitcoin redeemer address');
  const bitcoinRedeemerAddress = prompt('BTC address: ');

  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(etherSignerPrivKey, provider);

  console.log('Please enter the amount of BTC to redeem (e.g 0.0089');
  const amountInput = parseFloat(prompt('BTC Amount: '));
  if (isNaN(amountInput)) {
    console.log('Invalid amount');
    return;
  }
  const amountToRedeem = ethers.BigNumber.from(amountInput * 1e18);

  const sdk =
    process.env.NETWORK == 'testnet'
      ? await TBTC.initializeMainnet(signer)
      : await TBTC.initializeSepolia(signer);

  const { targetChainTxHash, walletPublicKey } =
    await sdk.redemptions.requestRedemption(
      bitcoinRedeemerAddress,
      amountToRedeem
    );

  console.log('Transaction sent');
  console.log(`Tx Hash: ${targetChainTxHash}`);
  console.log(`Redemption handler's public key: ${walletPublicKey}`);
};

async function initiateRefund(mint: Mint) {
  if (!mint.depositReceipt) {
    console.log('Error: No deposit receipt found for this mint');
    return;
  }

  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC);
  const signer = new ethers.Wallet(mint.etherSignerPrivKey, provider);

  const sdk =
    process.env.NETWORK === 'testnet'
      ? await TBTC.initializeSepolia(signer)
      : await TBTC.initializeMainnet(signer);

  try {
    // // Initialize deposit with stored receipt
    // const deposit = await sdk.deposits.recoverDeposit(mint.depositReceipt);
    // // Request refund
    // const refundTx = await deposit.requestRefund();
    // console.log(`Refund initiated! Transaction hash: ${refundTx}`);
    // mint.refundInitiated = true;
    // mint.status = 'refunded';
    // await saveMint(mint);
  } catch (error) {
    console.log('Error initiating refund:', error);
    console.log('Make sure:');
    console.log('1. The refund locktime has passed');
    console.log('2. You have enough ETH for gas fees');
    console.log('3. The deposit was not already minted or refunded');
  }
}


main();
