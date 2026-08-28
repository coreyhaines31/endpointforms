import { ImageResponse } from "next/og";

export const alt = "Endpoint Forms — your form can't tell a buyer from a bot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Deliberately no webfont fetch. next/og would need to pull Plex over the
// network at build time, and a share card is not worth a build that can fail
// offline. Brand carries through colour, the mark, and the layout instead.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fcfcfa",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M1.6 2.4H13.2V5.6H4.8V10.4H16.4V13.6H4.8V18.4H13.2V21.6H1.6Z"
              fill="#15140f"
            />
            <circle cx="19.4" cy="12" r="3.4" fill="#15140f" />
          </svg>
          <span style={{ fontSize: 30, fontWeight: 600, color: "#15140f" }}>
            Endpoint Forms
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.1,
              fontWeight: 700,
              color: "#15140f",
              letterSpacing: "-0.03em",
              maxWidth: 960,
            }}
          >
            Your form can&rsquo;t tell a buyer from a bot &mdash; and it&rsquo;s reporting
            both as conversions.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ height: 10, width: 132, background: "#c7f23c", border: "1px solid #15140f" }} />
          <span style={{ fontSize: 24, color: "#6a685e" }}>
            Open source &middot; AGPL &middot; endpointforms.com
          </span>
        </div>
      </div>
    ),
    size,
  );
}
