import { FeeAmount } from "@uniswap/v3-sdk";

import { createTrade } from "./libs/trading";
import { USDC_TOKEN, WETH_TOKEN } from "./libs/constants";
import { TBTC_TOKEN } from "./libs/constants";
import { executeTrade } from "./libs/trading";

export const SECOND = 1000;
export const MINUTE = SECOND * 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;

export const schedule = {
  enabled: false,
  interval: 1 * MINUTE,
  action: async () => {
    console.log('Scheduled action running at ', new Date().toISOString());

    const btcAmount = 0.01;

    const trade = await createTrade(
      WETH_TOKEN,
      USDC_TOKEN,
      FeeAmount.MEDIUM,
      btcAmount
    );

    await executeTrade(trade, TBTC_TOKEN);
    console.log('Trade executed');
    console.log('--------------------------------');
    console.log('\n');
  }
};
