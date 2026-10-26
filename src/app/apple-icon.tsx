import { ImageResponse } from "next/og";

// The home-screen icon for "Add to Home Screen" on iPhone. iOS needs an opaque square, so the egg-in-a-nest mark
// sits on a pale sky tile, with room around it for the rounded corners.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef6fd" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M16 1.2c5 0 9.2 8 9.2 14.2 0 6.2-4.1 10.2-9.2 10.2S6.8 21.6 6.8 15.4C6.8 9.2 11 1.2 16 1.2Z" fill="#4f9fe6" />
          <circle cx="12.9" cy="10.6" r="1.7" fill="#1d5a91" opacity="0.5" />
          <circle cx="18.6" cy="15.2" r="1.9" fill="#1d5a91" opacity="0.5" />
          <path d="M1 17.4c1.3 7.8 7.2 12.9 15 12.9s13.7-5.1 15-12.9c-3.3 2.6-8.8 4.2-15 4.2S4.3 20 1 17.4Z" fill="#d2a95c" />
          <path d="M5.6 24.6c3 2 6.6 3 10.4 3s7.4-1 10.4-3" fill="none" stroke="#94692a" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
