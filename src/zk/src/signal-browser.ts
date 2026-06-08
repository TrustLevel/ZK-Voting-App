/**
 * Browser-safe vote signal encoding/decoding.
 *
 * Mirrors signal.ts but uses a dynamic import for @meshsdk/core-csl instead of
 * a module-level require(), which would fail in the browser before WASM is ready.
 */

export async function encodeVoteSignal(options: Array<[number, number]>): Promise<string> {
  const { csl } = await import('@meshsdk/core-csl');
  const outer = csl.PlutusList.new();
  for (const [index, count] of options) {
    const inner = csl.PlutusList.new();
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(index))));
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(count))));
    outer.add(csl.PlutusData.new_list(inner));
  }
  return Buffer.from(csl.PlutusData.new_list(outer).to_bytes()).toString('hex');
}

export async function decodeVoteSignal(hex: string): Promise<Array<[number, number]>> {
  const { csl } = await import('@meshsdk/core-csl');
  const data = csl.PlutusData.from_bytes(Buffer.from(hex, 'hex'));
  const outer = data.as_list()!;
  const options: Array<[number, number]> = [];
  for (let i = 0; i < outer.len(); i++) {
    const inner = outer.get(i).as_list()!;
    const index = parseInt(inner.get(0).as_integer()!.to_str());
    const count = parseInt(inner.get(1).as_integer()!.to_str());
    options.push([index, count]);
  }
  return options;
}
