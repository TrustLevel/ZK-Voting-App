/**
 * Browser-safe G1/G2 compression.
 *
 * Mirrors conversion.ts but uses dynamic imports for bigint-buffer and
 * ffjavascript to avoid loading them at module initialization time, which
 * causes issues in Next.js SSR where these libs expect a browser environment.
 */

type G1Point = [string, string, string];
type G2Point = [[string, string], [string, string], [string, string]];

export async function compressedG1(point: G1Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-expect-error — ffjavascript has no type declarations
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result: Buffer = bb.toBufferBE(BigInt(point[0]), 48);
  const COMPRESSED = 0b10000000, INFINITY = 0b01000000, YBIT = 0b00100000;
  result[0] |= COMPRESSED;

  if (BigInt(point[2]) !== 1n) {
    result[0] |= INFINITY;
  } else {
    const F = curve.G1.F;
    const x = F.fromObject(BigInt(point[0]));
    const x3b = F.add(F.mul(F.square(x), x), curve.G1.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));
    const y = BigInt(point[1]);
    if ((y1 > y2 && y > y2) || (y1 < y2 && y > y1)) result[0] |= YBIT;
  }
  return result.toString('hex');
}

export async function compressedG2(point: G2Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-expect-error — ffjavascript has no type declarations
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result = Buffer.concat([bb.toBufferBE(BigInt(point[0][1]), 48), bb.toBufferBE(BigInt(point[0][0]), 48)]);
  const COMPRESSED = 0b10000000, INFINITY = 0b01000000, YBIT = 0b00100000;
  result[0] |= COMPRESSED;

  if (BigInt(point[2][0]) !== 1n) {
    result[0] |= INFINITY;
  } else {
    const F = curve.G2.F;
    const x = F.fromObject(point[0].map((s: string) => BigInt(s)));
    const x3b = F.add(F.mul(F.square(x), x), curve.G2.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));
    function gt(a: [bigint, bigint], b: [bigint, bigint]) { return a[1] > b[1] || (a[1] === b[1] && a[0] > b[0]); }
    const y = point[1].map((s: string) => BigInt(s)) as [bigint, bigint];
    if ((gt(y1, y2) && gt(y, y2)) || (gt(y2, y1) && gt(y, y1))) result[0] |= YBIT;
  }
  return result.toString('hex');
}
