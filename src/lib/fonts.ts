import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

/**
 * IBM Plex, loaded once for the surfaces that want it.
 *
 * `next/font` has to be called from module scope, and every call site produces
 * its own CSS module and its own hashed variable class — so three root layouts
 * each calling `IBM_Plex_Sans()` would ship three copies of the same
 * declarations. One module, imported by the roots that want the face.
 *
 * The hosted form root (`src/app/(forms)/layout.tsx`) deliberately does not
 * import this. Loading a webfont on a page whose traffic someone paid for, to
 * set *our* typeface on *their* enquiry form, is 60 KB spent against the
 * customer. `globals.css` gives `--font-plex-sans` a fallback for exactly that
 * case.
 */

export const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/** Both variable classes, ready to go on `<html>`. */
export const FONT_VARIABLES = `${plexSans.variable} ${plexMono.variable}`;
