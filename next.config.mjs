/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    distDir: process.env.NEXT_DIST_DIR || ".next",
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "Referrer-Policy",
                        value: "no-referrer",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                ],
            },
        ];
    },
    outputFileTracingIncludes: {
        "/*": [
            ".data/**/*",
            "node_modules/next/dist/server/dev/browser-logs/**/*",
        ],
    },
    outputFileTracingExcludes: {
        "/": [
            "SofascoreData/**/*",
            "logs/**/*",
            "__tests__/**/*",
            "__mocks__/**/*",
            "coverage/**/*",
            ".venv/**/*",
            "SofascoreData/.venv/**/*",
            ".data-build/**/*",
            ".data.stale-*",
            "*.ipynb",
            "tsconfig.tsbuildinfo",
        ],
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "api.sofascore.app",
            }
        ],
    },
}

export default nextConfig;
