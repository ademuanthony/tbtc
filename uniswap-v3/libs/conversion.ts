import { BigNumber, ethers } from 'ethers'
import { DAY, HOUR, MINUTE, SECOND } from '../schedule'

const READABLE_FORM_LEN = 4

export function fromReadableAmount(
  amount: number,
  decimals: number
): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), decimals)
}

export function toReadableAmount(rawAmount: number, decimals: number): string {
  return ethers.utils
    .formatUnits(rawAmount, decimals)
    .slice(0, READABLE_FORM_LEN)
}

export function formatInterval(interval: number): string {
  if (interval < MINUTE) {
    return `${interval / SECOND}s`
  } else if (interval < HOUR) {
    return `${interval / MINUTE}m`
  } else if (interval < DAY) {
    return `${interval / HOUR}h`
  } else {
    return `${interval / DAY}d`
  }
}
