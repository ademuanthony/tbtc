import { CurrentConfig } from './config/config';
import { fromReadableAmount, toReadableAmount } from './libs/conversion';
import { getQuote } from './libs/quote';
import readline from 'readline';
import { getStdInput } from './libs/readline';
import { TBTC_TOKEN, USDC_TOKEN, WETH_TOKEN } from './libs/constants';
import { FeeAmount } from '@uniswap/v3-sdk';

const main = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\nWhat would you like to do?');
    console.log('1. Swap Tokens');
    console.log('2. Add Liquidity');

    const action = await getStdInput('\nSelect action (1-2): ', rl);

    if (action === '1') {
      console.log('\nAvailable tokens:');
        console.log('1. WETH');
        console.log('2. TBTC');
        console.log('3. USDC');

        const tokenInChoice = await getStdInput('\nSelect input token (1-3): ', rl);
        const tokenOutChoice = await getStdInput('Select output token (1-3): ', rl);
        const inputAmount = await getStdInput('Enter amount to swap: ', rl);

        // Map choices to tokens
        const tokenMap = {
          1: WETH_TOKEN,
          2: TBTC_TOKEN,
          3: USDC_TOKEN,
        };

        const tokenIn = tokenMap[tokenInChoice];
        const tokenOut = tokenMap[tokenOutChoice];

        if (!tokenIn || !tokenOut) {
          throw new Error('Invalid token selection');
        }

        const amountOut = await getQuote(tokenIn, tokenOut, FeeAmount.MEDIUM, parseFloat(inputAmount));

        console.log(`Quote: ${toReadableAmount(amountOut, tokenOut.decimals)}`);
    } else if (action === '2') {
      console.log('Adding liquidity...');
    }

    rl.close();
  } catch(err) {
    console.error(err);
  }
};

main();
