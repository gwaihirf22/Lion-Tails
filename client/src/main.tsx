import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Twenty `document.documentElement.style.setProperty` calls used to live here,
 * setting the whole shadcn palette as INLINE styles on <html>, plus a remote
 * Unsplash photo as the body background.
 *
 * They are gone, and this comment is here so nobody puts them back.
 *
 * An inline style on <html> beats any :root rule from a stylesheet, whatever
 * its specificity or order. So that block silently defeated every theming
 * mechanism the project had: theme.json's palette and radius, the entire
 * output of @replit/vite-plugin-shadcn-theme-json, the plugin's
 * prefers-color-scheme block, and `darkMode: ["class"]`. All of it was dead
 * code that looked live. The app could not be themed at all.
 *
 * The colours now live in theme.css as ordinary CSS custom properties, keyed
 * on data-palette so the site follows the reader's palette.
 *
 * The Unsplash background is gone too: it was a remote hotlink on the critical
 * path of a children's bedtime app -- one that showed a party, on every page.
 */

createRoot(document.getElementById("root")!).render(<App />);
