/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**.api-sports.io",
            },
            {
                protocol: "https",
                hostname: "flagcdn.com",
            }
        ],
    },
    env: {
        DATABASE_URL: process.env.DATABASE_URL
    },
    async redirects() {
        return [
            {
                source: '/verify',
                destination: '/user/verify',
                permanent: true
            },
            {
                source: '/reset-password',
                destination: '/user/reset-password',
                permanent: true
            }
        ]
    }
}

export default nextConfig;