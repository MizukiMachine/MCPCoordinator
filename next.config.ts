import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run では Next.js のスタンドアロン出力で最小ランタイムを作る
  output: "standalone",
};

export default nextConfig;
