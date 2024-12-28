import { ethers } from 'ethers';
import FACTORY_ABI from './abis/factory.json' assert { type: 'json' };
import QUOTER_ABI from './abis/quoter.json' assert { type: 'json' };
import SWAP_ROUTER_ABI from './abis/swaprouter.json' assert { type: 'json' };
import POOL_ABI from './abis/pool.json' assert { type: 'json' };
import TOKEN_IN_ABI from './abis/weth.json' assert { type: 'json' };
import POSITION_MANAGER_ABI from './abis/positionManager.json' assert { type: 'json' };
import 'dotenv/config';
import readline from 'readline/promises';

// Deployment Addresses
const POOL_FACTORY_CONTRACT_ADDRESS =
  '0x0227628f3F023bb0B980b67D528571c95c6DaC1c';
const QUOTER_CONTRACT_ADDRESS = '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3';
const SWAP_ROUTER_CONTRACT_ADDRESS =
  '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const POSITION_MANAGER_ADDRESS = '0x1238536071E1c677A632429e3655c799b22cDA52'; // Replace with actual address

// Provider, Contract & Signer Instances
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const factoryContract = new ethers.Contract(
  POOL_FACTORY_CONTRACT_ADDRESS,
  FACTORY_ABI,
  provider
);
const quoterContract = new ethers.Contract(
  QUOTER_CONTRACT_ADDRESS,
  QUOTER_ABI,
  provider
);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Token Configuration
const WETH = {
  chainId: 11155111,
  address: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  decimals: 18,
  symbol: 'WETH',
  name: 'Wrapped Ether',
  isToken: true,
  isNative: true,
  wrapped: true,
};

const TBTC = {
  chainId: 11155111,
  address: '0x517f2982701695D4E52f1ECFBEf3ba31Df470161',
  decimals: 18,
  symbol: 'TBTC',
  name: 'tBTC',
  isToken: false,
  isNative: true,
  wrapped: true,
};

const USDC = {
  chainId: 11155111,
  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  decimals: 6,
  symbol: 'USDC',
  name: 'USD//C',
  isToken: true,
  isNative: true,
  wrapped: false,
};

async function approveToken(tokenAddress, tokenABI, amount, wallet) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);

    const approveTransaction = await tokenContract.approve.populateTransaction(
      SWAP_ROUTER_CONTRACT_ADDRESS,
      ethers.parseEther(amount.toString())
    );

    const transactionResponse = await wallet.sendTransaction(
      approveTransaction
    );
    console.log(`-------------------------------`);
    console.log(`Sending Approval Transaction...`);
    console.log(`-------------------------------`);
    console.log(`Transaction Sent: ${transactionResponse.hash}`);
    console.log(`-------------------------------`);
    const receipt = await transactionResponse.wait();
    console.log(
      `Approval Transaction Confirmed! https://sepolia.etherscan.io/txn/${receipt.hash}`
    );
  } catch (error) {
    console.error('An error occurred during token approval:', error);
    throw new Error('Token approval failed');
  }
}

async function getPoolInfo(factoryContract, tokenIn, tokenOut) {
  const poolAddress = await factoryContract.getPool(
    tokenIn.address,
    tokenOut.address,
    3000
  );
  if (!poolAddress) {
    throw new Error('Failed to get pool address');
  }
  const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ]);
  return { poolContract, token0, token1, fee };
}

async function quoteAndLogSwap(
  quoterContract,
  fee,
  signer,
  tokenIn,
  tokenOut,
  amountIn
) {
  const quotedAmountOut = await quoterContract.quoteExactInputSingle.staticCall(
    {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: fee,
      recipient: signer.address,
      deadline: Math.floor(new Date().getTime() / 1000 + 60 * 10),
      amountIn: amountIn,
      sqrtPriceLimitX96: 0,
    }
  );

  const formattedAmountIn = ethers.formatUnits(
    amountIn.toString(),
    tokenIn.decimals
  );
  const formattedAmountOut = ethers.formatUnits(
    quotedAmountOut[0].toString(),
    tokenOut.decimals
  );

  console.log(`-------------------------------`);
  console.log(`Quote Summary:`);
  console.log(`You will receive: ${formattedAmountOut} ${tokenOut.symbol}`);
  console.log(`You will pay: ${formattedAmountIn} ${tokenIn.symbol}`);
  console.log(
    `Rate: 1 ${tokenIn.symbol} = ${(
      formattedAmountOut / formattedAmountIn
    ).toFixed(6)} ${tokenOut.symbol}`
  );
  console.log(`-------------------------------`);

  return formattedAmountOut;
}

async function prepareSwapParams(
  poolContract,
  signer,
  tokenIn,
  tokenOut,
  amountIn,
  amountOut
) {
  return {
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    fee: await poolContract.fee(),
    recipient: signer.address,
    amountIn: amountIn,
    amountOutMinimum: ethers.parseUnits(
      amountOut.toString(),
      tokenOut.decimals
    ),
    sqrtPriceLimitX96: 0,
  };
}

async function executeSwap(swapRouter, params, signer) {
  const transaction = await swapRouter.exactInputSingle.populateTransaction(
    params
  );
  const receipt = await signer.sendTransaction(transaction);
  console.log(`-------------------------------`);
  console.log(`Receipt: https://sepolia.etherscan.io/tx/${receipt.hash}`);
  console.log(`-------------------------------`);
}

async function addLiquidity(tokenA, tokenB, amountA, amountB, signer) {
  try {
    // First approve both tokens
    await approveToken(tokenA.address, TOKEN_IN_ABI, amountA, signer);
    await approveToken(tokenB.address, TOKEN_IN_ABI, amountB, signer);

    // Sort tokens to determine token0 and token1 (required by Uniswap V3)
    const [token0, token1] =
      tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? [tokenA, tokenB]
        : [tokenB, tokenA];

    const [amount0, amount1] =
      tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? [amountA, amountB]
        : [amountB, amountA];

    const FEE_TIER = 3000;

    // Check if pool exists, if not create it
    let pool = await factoryContract.getPool(
      token0.address,
      token1.address,
      FEE_TIER
    );

    if (pool === '0x0000000000000000000000000000000000000000') {
      console.log('Pool does not exist. Creating pool...');
      const tx = await factoryContract.createPool(
        token0.address,
        token1.address,
        FEE_TIER
      );
      await tx.wait();
      console.log('Pool created successfully!');

      // Get the new pool address
      pool = await factoryContract.getPool(
        token0.address,
        token1.address,
        FEE_TIER
      );
    }

    const poolContract = new ethers.Contract(pool, POOL_ABI, signer);

    // Initialize pool if needed
    try {
      const slot0 = await poolContract.slot0();
    } catch (error) {
      console.log('Initializing pool...');
      // Calculate initial sqrt price for 1:1 price ratio
      const price = 1;
      const sqrtPriceX96 = BigInt(Math.floor(Math.sqrt(price) * 2 ** 96));
      const tx = await poolContract.initialize(sqrtPriceX96);
      await tx.wait();
      console.log('Pool initialized successfully!');
    }

    // Create position manager contract
    const positionManagerContract = new ethers.Contract(
      POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI,
      signer
    );

    // Use fixed ticks for a common price range (-10% to +10%)
    const minPrice = 0.9;
    const maxPrice = 1.1;

    // Convert prices to ticks
    const tickLower = Math.floor(Math.log(minPrice) / Math.log(1.0001));
    const tickUpper = Math.ceil(Math.log(maxPrice) / Math.log(1.0001));

    // Ensure ticks are divisible by tick spacing (60 for 0.3% fee tier)
    const tickSpacing = 60;
    const adjustedTickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
    const adjustedTickUpper = Math.ceil(tickUpper / tickSpacing) * tickSpacing;

    console.log('Debug Info:');
    console.log('Pool Address:', pool);
    console.log('Token0:', token0.address);
    console.log('Token1:', token1.address);
    console.log('Tick Lower:', adjustedTickLower);
    console.log('Tick Upper:', adjustedTickUpper);

    // Calculate minimum amounts (with 1% slippage tolerance)
    const amount0Desired = ethers.parseUnits(
      amount0.toString(),
      token0.decimals
    );
    const amount1Desired = ethers.parseUnits(
      amount1.toString(),
      token1.decimals
    );
    const amount0Min = (amount0Desired * 99n) / 100n;
    const amount1Min = (amount1Desired * 99n) / 100n;

    // Prepare parameters for adding liquidity
    const params = {
      token0: token0.address,
      token1: token1.address,
      fee: FEE_TIER,
      tickLower: adjustedTickLower,
      tickUpper: adjustedTickUpper,
      amount0Desired,
      amount1Desired,
      amount0Min,
      amount1Min,
      recipient: await signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    };

    console.log('Mint Parameters:', params);

    // Execute mint transaction
    const tx = await positionManagerContract.mint(params);
    const receipt = await tx.wait();

    console.log(`-------------------------------`);
    console.log(`Liquidity Added Successfully!`);
    console.log(`Transaction: https://sepolia.etherscan.io/tx/${receipt.hash}`);
    console.log(`-------------------------------`);
  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw error;
  }
}

// Modify main function to include menu
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\nWhat would you like to do?');
    console.log('1. Swap Tokens');
    console.log('2. Add Liquidity');

    const action = await rl.question('\nSelect action (1-2): ');

    if (action === '1') {
      try {
        console.log('\nAvailable tokens:');
        console.log('1. WETH');
        console.log('2. TBTC');
        console.log('3. USDC');

        const tokenInChoice = await rl.question('\nSelect input token (1-3): ');
        const tokenOutChoice = await rl.question('Select output token (1-3): ');
        const inputAmount = await rl.question('Enter amount to swap: ');

        // Map choices to tokens
        const tokenMap = {
          1: WETH,
          2: TBTC,
          3: USDC,
        };

        const tokenIn = tokenMap[tokenInChoice];
        const tokenOut = tokenMap[tokenOutChoice];

        if (!tokenIn || !tokenOut) {
          throw new Error('Invalid token selection');
        }

        const amountIn = ethers.parseUnits(
          inputAmount.toString(),
          tokenIn.decimals
        );

        await approveToken(tokenIn.address, TOKEN_IN_ABI, amountIn, signer);
        const { poolContract, token0, token1, fee } = await getPoolInfo(
          factoryContract,
          tokenIn,
          tokenOut
        );
        console.log('Pool Address: ', await poolContract.getAddress());
        console.log(`-------------------------------`);
        console.log(
          `Fetching Quote for: ${tokenIn.symbol} to ${tokenOut.symbol}`
        );
        console.log(`-------------------------------`);
        console.log(`Swap Amount: ${ethers.formatEther(amountIn)}`);

        const quotedAmountOut = await quoteAndLogSwap(
          quoterContract,
          fee,
          signer,
          tokenIn,
          tokenOut,
          amountIn
        );

        const params = await prepareSwapParams(
          poolContract,
          signer,
          tokenIn,
          tokenOut,
          amountIn,
          quotedAmountOut
        );
        const swapRouter = new ethers.Contract(
          SWAP_ROUTER_CONTRACT_ADDRESS,
          SWAP_ROUTER_ABI,
          signer
        );
        await executeSwap(swapRouter, params, signer);

        rl.close();
      } catch (error) {
        console.error('An error occurred:', error.message);
        rl.close();
      }
    } else if (action === '2') {
      console.log('\nAvailable tokens:');
      console.log('1. WETH');
      console.log('2. TBTC');
      console.log('3. USDC');

      const tokenAChoice = await rl.question('\nSelect first token (1-3): ');
      const tokenBChoice = await rl.question('Select second token (1-3): ');
      const amountA = await rl.question(`Enter amount for first token: `);
      const amountB = await rl.question(`Enter amount for second token: `);

      const tokenMap = {
        1: WETH,
        2: TBTC,
        3: USDC,
      };

      const tokenA = tokenMap[tokenAChoice];
      const tokenB = tokenMap[tokenBChoice];

      if (!tokenA || !tokenB) {
        throw new Error('Invalid token selection');
      }

      await addLiquidity(tokenA, tokenB, amountA, amountB, signer);
    } else {
      throw new Error('Invalid action selected');
    }

    rl.close();
  } catch (error) {
    console.error('An error occurred:', error.message);
    rl.close();
  }
}

// Call main without parameters now
main();
