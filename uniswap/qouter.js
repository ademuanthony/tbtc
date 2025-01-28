import { Contract, formatUnits, JsonRpcProvider, parseUnits } from 'ethers';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: 'json' };
import QuoterABI from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json' assert { type: 'json' };
import { getAbi, getPoolImmutables } from './helpers.js';
import 'dotenv/config';

const INFURA_URL = process.env.INFURA_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const provider = new JsonRpcProvider(INFURA_URL);

const poolAddress = '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed';

const quoterAddress = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

const getPrice = async (inputAmount) => {
  const poolContract = new Contract(
    poolAddress,
    IUniswapV3PoolABI.abi,
    provider
  );

  const tokenAddress0 = await poolContract.token0();
  const tokenAddress1 = await poolContract.token1();

  const tokenAbi0 = await getAbi(tokenAddress0);
  const tokenAbi1 = await getAbi(tokenAddress1);

  const tokenContract0 = new Contract(
    tokenAddress0,
    tokenAbi0,
    provider
  );
  const tokenContract1 = new Contract(
    tokenAddress1,
    tokenAbi1,
    provider
  );

  const tokenSymbol0 = await tokenContract0.symbol();
  const tokenSymbol1 = await tokenContract1.symbol();
  const tokenDecimals0 = await tokenContract0.decimals();
  const tokenDecimals1 = await tokenContract1.decimals();

  const quoterContract = new Contract(
    quoterAddress,
    QuoterABI.abi,
    provider
  );

  const immutables = await getPoolImmutables(poolContract);

  const amountIn = parseUnits(
    inputAmount.toString(),
    tokenDecimals0
  );

  console.log(quoterContract);

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    immutables.token0,
    immutables.token1,
    immutables.fee,
    amountIn,
    0
  );

  const amountOut = formatUnits(quotedAmountOut, tokenDecimals1);

  console.log('=========');
  console.log(
    `${inputAmount} ${tokenSymbol0} can be swapped for ${amountOut} ${tokenSymbol1}`
  );
  console.log('=========');
};

getPrice(1);
