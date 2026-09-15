import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useParentMode } from "@/hooks/use-parent-mode";
import { Lock } from "lucide-react";

/**
 * The Parent Mode password prompt, in one place.
 *
 * Opened by the Settings switch, and in place by anything that needs Parent
 * Mode for one action -- the story Edit button asks here and then opens the
 * editor, rather than hiding itself until someone finds Settings. "Keep it on"
 * stays a choice made at the prompt each time, never a setting.
 */
export default function ParentModeUnlockDialog({
  open,
  onOpenChange,
  onUnlocked,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked?: () => void;
  /** Why the prompt appeared, when it was not the Settings switch. */
  reason?: string;
}) {
  const { verifyPassword } = useParentMode();
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsVerifying(true);
    const success = await verifyPassword(password, keep);
    setIsVerifying(false);

    if (success) {
      setPassword("");
      setKeep(false);
      onOpenChange(false);
      onUnlocked?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Lock className="h-5 w-5 text-warning" />
            <span>Verify Password</span>
          </DialogTitle>
          <DialogDescription>
            {reason ? `${reason} ` : ""}
            Enter your account password to turn Parent Mode on for 30 minutes, or until you
            turn it off.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">Account Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isVerifying}
              autoFocus
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="keep-parent-mode"
              checked={keep}
              onCheckedChange={(v) => setKeep(v === true)}
              disabled={isVerifying}
              className="mt-0.5"
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="keep-parent-mode" className="text-sm font-medium">
                Keep it on until I turn it off or sign out
              </Label>
              <p className="text-xs text-muted-foreground">
                Otherwise it turns itself off after 30 minutes. On a shared device, leave
                this unticked.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!password.trim() || isVerifying}
              className="bg-warning hover:bg-warning"
            >
              {isVerifying ? "Verifying..." : "Turn Parent Mode on"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
