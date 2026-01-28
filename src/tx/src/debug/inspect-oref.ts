import { txOutRef, mTxOutRef } from '@meshsdk/core';

// Test the structure created by txOutRef
const oref1 = txOutRef("8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c", 1);
console.log('txOutRef structure:');
console.log(JSON.stringify(oref1, null, 2));

// Test the structure created by mTxOutRef
const oref2 = mTxOutRef("8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c", 1);
console.log('\nmTxOutRef structure:');
console.log(JSON.stringify(oref2, null, 2));
