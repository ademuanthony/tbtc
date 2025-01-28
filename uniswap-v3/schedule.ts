import { FeeAmount } from "@uniswap/v3-sdk";

import { createTrade } from "./libs/trading";
import { WETH_TOKEN } from "./libs/constants";
import { TBTC_TOKEN } from "./libs/constants";
import { executeTrade } from "./libs/trading";

export const SECOND = 1000;
export const MINUTE = SECOND * 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;

export const schedule = {
  enabled: false,
  interval: DAY,
  action: async () => {
    console.log('Scheduled action running at ', new Date().toISOString());

    const btcAmount = 0.0001;

    const trade = await createTrade(
      TBTC_TOKEN,
      WETH_TOKEN,
      FeeAmount.MEDIUM,
      btcAmount
    );

    await executeTrade(trade, TBTC_TOKEN);
  }
};
