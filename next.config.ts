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

  async headers() {
    return [
      {
        // The hosted form only. A stepped form carries its partial key in the
        // query string — `?p=<144 bits>` — and whoever holds that key can read
        // back the answers it names. They are the visitor's own answers, which
        // is why the notice says so rather than pretending it is a session
        // cookie, but the key should not travel any further than the address bar.
        //
        // Nothing on this page makes an outbound request today, so there is no
        // live leak. The point is that adding one later — a link in help text,
        // an image, a webfont — would silently start sending the key in a
        // `Referer` header to whoever that resource belongs to. This makes that
        // impossible rather than something to remember.
        source: "/f/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
