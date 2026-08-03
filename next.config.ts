import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output keeps the serverless bundle self-contained, which is
   * what AWS Amplify's SSR compute expects.
   */
  output: "standalone",

  /**
   * The AWS SDK is server-only. Marking it external keeps it out of any
   * client bundle and avoids bundling its native-ish dependencies.
   */
  serverExternalPackages: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-s3",
  ],

  async headers() {
    return [
      {
        // Orchestration state and evidence are never cacheable, and the
        // internal surfaces must not be indexed.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
