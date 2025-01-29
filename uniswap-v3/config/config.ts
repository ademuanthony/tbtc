import { Token } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'

import { USDC_TOKEN, WETH_TOKEN } from '../libs/constants'

// Sets if the example should run locally or on chain
export enum Environment {
  LOCAL,
  MAINNET,
  WALLET_EXTENSION,
}

// Inputs that configure this example to run
export interface ExampleConfig {
  env: Environment
  rpc: {
    local: string
    mainnet: string
  }
  wallet: {
    address: string
    privateKey: string
  }
  // tokens: {
  //   in: Token
  //   amountIn: number
  //   out: Token
  //   poolFee: number
  // }
}

// Example Configuration

export const CurrentConfig: ExampleConfig = {
  env: Environment.LOCAL,
  rpc: {
    local: 'http://localhost:8545',
    mainnet: 'https://site1.moralis-nodes.com/eth/38758c4032ae4fa8a1781971271f26d3',
  },
  wallet: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  // tokens: {
  //   in: WETH_TOKEN,
  //   amountIn: 1,
  //   out: USDC_TOKEN,
  //   poolFee: FeeAmount.MEDIUM,
  // },
}
