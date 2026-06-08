import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Packages that load native resources (WASM, node: built-ins) and must be
  // require()'d from node_modules at SSR runtime rather than bundled by webpack.
  serverExternalPackages: [
    '@sidan-lab/sidan-csl-rs-nodejs',
    '@meshsdk/core-csl',
    // @peculiar/webcrypto uses node:buffer / node:crypto / node:process.
    // On the server these are valid Node.js built-ins; on the client the
    // browser's native window.crypto.subtle is used instead (see client alias below).
    '@peculiar/webcrypto',
    '@meshsdk/web3-sdk',
  ],
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
    if (!isServer) {
      // @peculiar/webcrypto is a Node.js WebCrypto polyfill that imports node:buffer,
      // node:crypto, and node:process — none of which webpack can handle for browser bundles.
      // @meshsdk/web3-sdk only calls new WebCrypto() in the non-browser branch; in the browser
      // window.crypto.subtle is detected first, so this empty alias is safe.
      config.resolve.alias['@peculiar/webcrypto'] = false;
    }
    return config;
  },
};

export default nextConfig;
