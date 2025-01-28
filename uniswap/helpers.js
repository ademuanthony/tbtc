import axios from 'axios'
import 'dotenv/config' // eslint-disable-line no-unused-vars

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

export const getAbi = async (address) => {
  const url = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`
  const res = await axios.get(url)
  const abi = JSON.parse(res.data.result)
  return abi
}

export const getPoolImmutables = async (poolContract) => {
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ])

  const immutables = {
    token0: token0,
    token1: token1,
    fee: fee
  }

  return immutables
}