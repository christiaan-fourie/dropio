/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/business-cards",
        destination: "/",
        permanent: false,
      },
      {
        source: "/custom-layout",
        destination: "/",
        permanent: false,
      },
      {
        source: "/file-inspector",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
