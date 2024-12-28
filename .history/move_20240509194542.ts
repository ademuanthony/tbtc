import * as ethers from "ethers"
import { TBTC } from "@keep-network/tbtc-v2.ts"

require()

// Create an Ethers provider. Pass the URL of an Ethereum mainnet node.
// For example, Alchemy or Infura.
const provider = new ethers.JsonRpcProvider("...")
// Create an Ethers signer. Pass the private key and the above provider.
const signer = new ethers.Wallet("...", provider)

// If you want to initialize the SDK just for read-only actions, it is
// enough to pass the provider. 
const sdkReadonly = await TBTC.initializeMainnet(provider)
// If you want to make transactions as well, you have to pass the signer.
const sdk = await TBTC.initializeMainnet(signer)