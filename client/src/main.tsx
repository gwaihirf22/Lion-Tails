import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Add custom styles
document.documentElement.style.setProperty("--background", "250 100% 98%");
document.documentElement.style.setProperty("--foreground", "271 30% 21%");
document.documentElement.style.setProperty("--primary", "213 100% 82%");
document.documentElement.style.setProperty("--primary-foreground", "222.2 47.4% 11.2%");
document.documentElement.style.setProperty("--secondary", "256 100% 85%");
document.documentElement.style.setProperty("--secondary-foreground", "222.2 47.4% 11.2%");
document.documentElement.style.setProperty("--muted", "210 40% 96.1%");
document.documentElement.style.setProperty("--muted-foreground", "271 15% 45%");
document.documentElement.style.setProperty("--accent", "343 100% 84%");
document.documentElement.style.setProperty("--accent-foreground", "222.2 47.4% 11.2%");
document.documentElement.style.setProperty("--card", "0 0% 100%");
document.documentElement.style.setProperty("--card-foreground", "271 30% 21%");
document.documentElement.style.setProperty("--popover", "0 0% 100%");
document.documentElement.style.setProperty("--popover-foreground", "271 30% 21%");
document.documentElement.style.setProperty("--destructive", "0 100% 50%");
document.documentElement.style.setProperty("--destructive-foreground", "210 40% 98%");
document.documentElement.style.setProperty("--border", "267 100% 95%");
document.documentElement.style.setProperty("--input", "267 100% 95%");
document.documentElement.style.setProperty("--ring", "213 100% 82%");
document.documentElement.style.setProperty("--radius", "0.5rem");

// Add custom classes to body
document.body.style.backgroundImage = "url('https://images.unsplash.com/photo-1513151233558-d860c5398176?ixlib=rb-1.2.1&auto=format&fit=crop&w=2500&q=80')";
document.body.style.backgroundSize = "cover";
document.body.style.backgroundAttachment = "fixed";
document.body.style.backgroundPosition = "center";

createRoot(document.getElementById("root")!).render(<App />);
