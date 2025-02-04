import { ethers } from 'ethers';
import { CurrentConfig } from '../config/config';
import { computePoolAddress, FullMath, TickMath } from '@uniswap/v3-sdk';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import {
  POOL_FACTORY_CONTRACT_ADDRESS,
  QUOTER_CONTRACT_ADDRESS,
} from './constants';
import { getProvider } from './providers';
import { toReadableAmount, fromReadableAmount } from './conversion';
import { Token } from '@uniswap/sdk-core';

export async function getQuote(tokenIn: Token, tokenOut: Token, poolFee: number, amountIn: number): Promise<number> {
  const quoterContract = new ethers.Contract(
    QUOTER_CONTRACT_ADDRESS,
    Quoter.abi,
    getProvider()
  );
  const poolConstants = await getPoolConstants(tokenIn, tokenOut, poolFee);

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    poolConstants.token0,
    poolConstants.token1,
    poolConstants.fee,
    fromReadableAmount(
      amountIn,
      tokenIn.decimals
    ).toString(),
    0
  );

  return quotedAmountOut;
}

export async function quotedAmountOut(tokenIn:Token, tokenOut:Token, poolFee:number, inputAmount:number):Promise<JSBI> {
  const currentPoolAddress = computePoolAddress({
    factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    tokenA: tokenIn,
    tokenB: tokenOut,
    fee: poolFee,
  });

  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    getProvider()
  );

  const slot0 = await poolContract.slot0();
  const currentTick = slot0.tick;

  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(currentTick)
  const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96)

  const baseAmount = JSBI.BigInt( inputAmount * (10 ** baseTokenDecimals))

  const shift = JSBI.leftShift( JSBI.BigInt(1), JSBI.BigInt(192))

  const quoteAmount = FullMath.mulDivRoundingUp(ratioX192, baseAmount, shift)

  return quoteAmount
}

async function getPoolConstants(tokenIn: Token, tokenOut: Token, poolFee: number): Promise<{
  token0: string;
  token1: string;
  fee: number;
}> {
  const currentPoolAddress = computePoolAddress({
    factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    tokenA: tokenIn,
    tokenB: tokenOut,
    fee: poolFee,
  });

  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    getProvider()
  );
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ]);

  return {
    token0,
    token1,
    fee,
  };
}
