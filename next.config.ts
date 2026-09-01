import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // Next's dev-tools badge defaults to bottom-left, which is exactly where
    // the app sidebar's footer now sits — it lands on top of the theme toggle
    // and reads as a stray avatar in screenshots. That cost real time once:
    // it was investigated as a rendering bug before `document.elementFromPoint`
    // came back with NEXTJS-PORTAL rather than our own button.
    //
    // Dev-only, and nothing shipped changes.
    position: "bottom-right",
  },
};

export default nextConfig;
