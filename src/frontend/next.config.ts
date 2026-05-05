import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // modp-semaphore-bls12381 ships raw TypeScript source; Next.js must transpile it.
  transpilePackages: ['modp-semaphore-bls12381'],
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    // @meshsdk/web3-sdk bundles a UTxO RPC provider that requires @utxorpc/sdk and @utxorpc/spec.
    // These are server-side gRPC packages not used in this frontend (Blockfrost is used instead).
    // Aliasing to false makes webpack emit an empty module, avoiding a fatal bundle error.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@utxorpc/sdk': false,
      '@utxorpc/spec': false,
    };
    return config;
  },
};

export default nextConfig;
