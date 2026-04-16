/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        outputFileTracingIncludes: {
            "/": [".data/**/*"],
        },
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "api.sofascore.app",
            }
        ],
    },
}

export default nextConfig;
