/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "Referrer-Policy",
                        value: "no-referrer",
                    },
                ],
            },
        ];
    },
    experimental: {
        outputFileTracingIncludes: {
            "/": [".data/**/*"],
        },
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
