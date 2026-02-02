import 'dotenv/config';

const apiKey = process.env.API_KEY || "";

// Transaction where we minted the Group NFT
const txHash = "4b3ae50d2732cfac39725e83b31b76aaa0c088c35cb263e0be5c226fedd1d62a";

console.log('Checking transaction:', txHash);
console.log('');

// Fetch transaction UTxOs using Blockfrost API
const response = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/txs/${txHash}/utxos`,
  {
    headers: {
      'project_id': apiKey
    }
  }
);

const data = await response.json();

console.log('Transaction Outputs:\n');

data.outputs.forEach((output: any, index: number) => {
  console.log(`[${index}] Address: ${output.address}`);
  console.log(`    Amount:`, output.amount);

  // Check if this output contains the Group NFT (non-lovelace asset)
  const hasNFT = output.amount.some((asset: any) => asset.unit !== 'lovelace');
  if (hasNFT) {
    console.log('    ✅ Contains Group NFT!');
    const nftAsset = output.amount.find((asset: any) => asset.unit !== 'lovelace');
    console.log(`    NFT Unit: ${nftAsset?.unit}`);
  }
  console.log('');
});

console.log('\nTo use as reference input in mint-semaphore.ts:');
const nftOutput = data.outputs.findIndex((output: any) =>
  output.amount.some((asset: any) => asset.unit !== 'lovelace')
);
if (nftOutput !== -1) {
  console.log(`const groupNftTxHash = "${txHash}";`);
  console.log(`const groupNftOutputIndex = ${nftOutput};`);
}
