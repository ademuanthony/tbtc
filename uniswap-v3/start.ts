import readline from 'readline';
import { getStdInput } from './libs/readline';
import { TBTC_TOKEN, USDC_TOKEN, WBTC_TOKEN, WETH_TOKEN } from './libs/constants';
import { FeeAmount } from '@uniswap/v3-sdk';
import { createTrade, executeTrade } from './libs/trading';
import { HOUR, schedule } from './schedule';
import { formatInterval } from './libs/conversion';
const main = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (schedule.enabled) {
    console.log('Schedule enabled. Running every ', formatInterval(schedule.interval));
    console.log('To perform a manual trade, run the script without the schedule enabled');
    console.log('Modify the schedule in the schedule.ts file');
    
    setInterval(schedule.action, schedule.interval);
  } else {
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
        console.log('4. WBTC');

        const tokenInChoice = await getStdInput(
          '\nSelect input token (1-4): ',
          rl
        );
        const tokenOutChoice = await getStdInput(
          'Select output token (1-4): ',
          rl
        );
        const inputAmount = await getStdInput('Enter amount to swap: ', rl);

        // Map choices to tokens
        const tokenMap = {
          1: WETH_TOKEN,
          2: TBTC_TOKEN,
          3: USDC_TOKEN,
          4: WBTC_TOKEN,
        };

        const tokenIn = tokenMap[tokenInChoice];
        const tokenOut = tokenMap[tokenOutChoice];

        if (!tokenIn || !tokenOut) {
          throw new Error('Invalid token selection');
        }

        const trade = await createTrade(
          tokenIn,
          tokenOut,
          FeeAmount.MEDIUM,
          parseFloat(inputAmount)
        );

        console.log(`Trade created: ${trade}`);
        const tx = await executeTrade(trade, tokenIn);

        console.log(`Trade executed successfully: ${tx}`);
      } else if (action === '2') {
        console.log('Adding liquidity...');
      }

      rl.close();
    } catch (err) {
      console.error(err);
    }
  }
};

main();
