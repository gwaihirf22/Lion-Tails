import { SettingsPanel } from "@/components/SettingsPanel";

/**
 * The full-page presentation of Settings, kept so /settings stays a real,
 * bookmarkable URL. The header's gear opens the same component in a dialog.
 */
export default function Settings() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-heading font-bold mb-8 text-foreground">Settings</h1>
      <SettingsPanel />
    </div>
  );
}
