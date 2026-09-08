import { Minus, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import { READER_PALETTES, READER_FONT_STEPS, type ReadingPrefs } from "@shared/schema";
import { PALETTE_META } from "./fonts";
import FontPicker from "./FontPicker";

/**
 * The same reading preferences, on the Settings page.
 *
 * They live primarily in the reader's own bar, because you find out the text is
 * too small by trying to read it. This is here because Blake asked for the font
 * to be "in the settings like the font size and themeing", and it costs almost
 * nothing: same provider, same picker component, no duplicated state.
 */
export function ReadingSettingsCard() {
  const { prefs, setPalette, setFont, setTypeset, setFontStep, fontSizePx, isSynced } =
    useReadingPrefs();

  return (
    <Card className="bg-card rounded-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-heading">Reading</CardTitle>
        <CardDescription>
          How stories look when you read them. These follow your account, and you can change
          them while reading too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="mb-2 block text-sm font-medium">Text size</Label>
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              disabled={prefs.fontStep <= 0}
              aria-label="Decrease text size"
              onClick={() => setFontStep(prefs.fontStep - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-24 text-sm text-muted-foreground" aria-live="polite">
              {fontSizePx} pixels
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              disabled={prefs.fontStep >= READER_FONT_STEPS.length - 1}
              aria-label="Increase text size"
              onClick={() => setFontStep(prefs.fontStep + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-sm font-medium">Colour theme</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour theme">
            {READER_PALETTES.map((p: ReadingPrefs["palette"]) => (
              <button
                key={p}
                role="radio"
                aria-checked={prefs.palette === p}
                onClick={() => setPalette(p)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  prefs.palette === p ? "border-primary ring-2 ring-primary/30" : "border-input"
                }`}
              >
                {/* Painted from the palette's own tokens, exactly as in the
                    reader -- so the sample cannot disagree with the page. */}
                <span className="reader-swatch h-5 w-5 rounded-full" data-palette={p} />
                {PALETTE_META[p].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sepia and Night are easier on the eyes at bedtime. High contrast is black on white.
          </p>
        </div>

        <div>
          <Label className="mb-2 block text-sm font-medium">Font</Label>
          <div className="rounded-lg border">
            <FontPicker value={prefs.font} onChange={setFont} />
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-sm font-medium">Classic storybook styling</Label>
          <div className="flex items-center gap-2">
            <Button
              variant={prefs.typeset === "classic" ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeset("classic")}
              aria-pressed={prefs.typeset === "classic"}
            >
              On
            </Button>
            <Button
              variant={prefs.typeset === "plain" ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeset("plain")}
              aria-pressed={prefs.typeset === "plain"}
            >
              Off
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A large opening capital, indented paragraphs and an ornament between scenes. Off
            gives plain spaced paragraphs. This is separate from the font, so you can have
            either with any typeface.
          </p>
        </div>

        {!isSynced && (
          <p className="text-xs text-warning">
            Not saved to your account yet — these are being kept on this device only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ReadingSettingsCard;
