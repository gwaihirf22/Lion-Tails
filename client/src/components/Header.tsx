import { Link, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useEffect, useState, useRef } from "react";
import { Menu, X, LogOut, User, ChevronDown, MoreHorizontal, Loader2, Settings as SettingsIcon } from "lucide-react";
import appIcon from "@/assets/app-icon.jpg";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useStoryJobs, describeJob } from "@/hooks/use-story-jobs";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { active: activeJobs } = useStoryJobs();
  const [menuOpen, setMenuOpen] = useState(false);
  // Settings opens OVER the page instead of navigating to one. Changing a
  // model or a text size should not cost you your place -- especially when the
  // thing you are adjusting is how the page you are looking at reads.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleItems, setVisibleItems] = useState(4); 
  const navContainerRef = useRef<HTMLUListElement>(null);
  const logoContainerRef = useRef<HTMLDivElement>(null);
  const { user, logoutMutation } = useAuth();

  const navItems = [
    { href: "/", text: "Home" },
    { href: "/generate-story", text: "Create Story" },
    { href: "/saved-stories", text: "My Stories" },
    { href: "/music", text: "Music" },
    { href: "/characters", text: "Characters" },
    { href: "/heroes-of-faith", text: "Heroes" },
    { href: "/image-analysis", text: "Image Analysis" },
    // Hiding the link is convenience, not security: requireAdmin on
    // /api/admin/generation-stats is what actually protects the data, and the
    // page renders the server 403 for anyone who navigates here directly.
    ...(user?.isAdmin ? [{ href: "/admin/stats", text: "Stats" }] : []),
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (menuOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen, isMobile]);

  useEffect(() => {
    if (isMobile) return;

    const handleResize = () => {
      const width = window.innerWidth;

      // Raised across the board because nothing wraps to a second line any
      // more: an item that used to fold into two stacked words now claims its
      // full width, so each count needs more room than it did.
      if (width > 1400) {
        setVisibleItems(6);
      } else if (width > 1240) {
        setVisibleItems(5);
      } else if (width > 1060) {
        setVisibleItems(4);
      } else if (width > 900) {
        setVisibleItems(3);
      } else {
        setVisibleItems(2);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobile]);

  const visibleNavItems = navItems.slice(0, visibleItems);
  const overflowNavItems = navItems.slice(visibleItems);
  const hasOverflow = overflowNavItems.length > 0;

  return (
    <>
      {/* Solid, not bg-primary/80. At 80% the blue blended with the page
          behind it and white text measured 4.12:1 in Paper -- under AA -- and
          the blend changed with whatever was scrolling underneath, so the
          contrast was not a fixed quantity at all. --header is opaque and
          per-palette, so it is one number that can be checked. */}
      <header className="bg-header text-header-foreground shadow-lg border-b border-header-foreground/20 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div ref={logoContainerRef} className="flex min-w-0 items-center space-x-3">
            <img 
              src={appIcon} 
              alt="Lion Tails Logo" 
              className="h-12 w-12 shrink-0 rounded-full border-2 border-header-foreground/25 object-cover shadow-lg md:h-14 md:w-14"
            />
            <h1 className="brand-wordmark text-2xl md:text-3xl text-header-foreground">
              Lion<span className="brand-accent"> Tails</span>
            </h1>

            {/* The affordance that makes navigating away feel safe. The Header
                is sticky and always mounted, so this is visible from every
                page while a story is being written. */}
            {activeJobs.length > 0 && (
              <Link href="/saved-stories">
                <span
                  className="hidden sm:flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-foreground cursor-pointer hover:bg-muted transition"
                  title={describeJob(activeJobs[0])}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {activeJobs.length === 1
                    ? describeJob(activeJobs[0])
                    : `${activeJobs.length} stories being written`}
                </span>
              </Link>
            )}
          </div>

          {isMobile ? (
            <div className="flex items-center space-x-2">
              {/* Without this, removing Settings from navItems would have left
                  a phone with no way to reach it at all. */}
              {user && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  title="Settings"
                  aria-label="Settings"
                  className="rounded-full p-2 text-header-foreground hover:bg-header-foreground/15 focus:outline-none"
                >
                  <SettingsIcon className="h-5 w-5" />
                </button>
              )}
              {user && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => logoutMutation.mutate()} 
                  className="text-header-foreground hover:bg-header-foreground/15 hover:text-header-foreground"
                  disabled={logoutMutation.isPending}
                >
                  <LogOut size={20} />
                </Button>
              )}
              <button 
                onClick={() => setMenuOpen(!menuOpen)} 
                className="z-50 rounded-full p-2 text-header-foreground hover:bg-header-foreground/15 focus:outline-none"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
              >
                {menuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <nav className="mr-4 min-w-0">
                <ul ref={navContainerRef} className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden text-sm md:text-base">
                  {visibleNavItems.map((item) => (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        aria-current={location === item.href ? "page" : undefined}
                        className={`inline-flex h-9 items-center whitespace-nowrap rounded-full px-3 font-medium transition-colors duration-200 ${
                          location === item.href
                            ? "bg-header-foreground text-header font-semibold shadow-sm"
                            : "text-header-foreground hover:bg-header-foreground/15"
                        }`}
                      >
                        {item.text}
                      </Link>
                    </li>
                  ))}

                  {hasOverflow && (
                    <li>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex h-9 items-center whitespace-nowrap rounded-full px-3 font-medium text-header-foreground transition-colors duration-200 hover:bg-header-foreground/15 data-[state=open]:bg-header-foreground/15">
                            <span className="mr-1">More</span>
                            <ChevronDown size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        {/* No nav-text and no bg-card here. This menu is a
                            POPOVER -- a light surface -- and nav-text paints
                            --header-foreground, which is white in three of the
                            four palettes. White on a near-white menu is why
                            "More" was unreadable until hovered. The shadcn
                            defaults already carry the right tokens. */}
                        <DropdownMenuContent align="end" className="w-48">
                          {overflowNavItems.map((item) => (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                aria-current={location === item.href ? "page" : undefined}
                                className={`w-full cursor-pointer ${location === item.href ? "font-semibold text-primary" : ""}`}
                              >
                                {item.text}
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )}
                </ul>
              </nav>

              {user ? (
                <div className="flex items-center">
                  <span className="nav-text mr-2 hidden truncate md:block">
                    {user.username}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSettingsOpen(true)}
                    title="Settings"
                    aria-label="Settings"
                    className="h-9 w-9 shrink-0 border-header-foreground/30 bg-transparent text-header-foreground hover:bg-header-foreground/15 hover:text-header-foreground"
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    title="Log out"
                    aria-label="Log out"
                    className="h-9 w-9 shrink-0 border-header-foreground/30 bg-transparent text-header-foreground hover:bg-header-foreground/15 hover:text-header-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Link href="/auth">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-header-foreground/30 bg-transparent text-header-foreground hover:bg-header-foreground/15 hover:text-header-foreground font-bold shadow-md" 
                  >
                    <User className="mr-1 h-4 w-4" />
                    <span>Login</span>
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          {/* Settings is long, so the DIALOG scrolls rather than the page
              behind it, and max-h keeps it inside a laptop viewport. */}
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-heading">Settings</DialogTitle>
              <DialogDescription>Changes save as you make them.</DialogDescription>
            </DialogHeader>
            <SettingsPanel />
          </DialogContent>
        </Dialog>

      </header>

      {isMobile && menuOpen && (
        <div className="fixed inset-0 z-50">
          {/* The one deliberate hardcoded colour left in the app: a scrim
              behind the mobile menu. A scrim is meant to be black in every
              palette -- tinting it to the theme would stop it doing its job. */}
          <div
            className="absolute inset-0 bg-black/40" 
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute top-0 right-0 left-0 pt-20 pb-4 px-4 bg-card shadow-lg border-b border-border max-h-screen overflow-y-auto">
            <div className="container mx-auto">
              <nav>
                <ul className="flex flex-col space-y-2 font-heading text-base">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      {/* Not nav-text: this sheet is bg-card, a light surface,
                          and nav-text is the bar's colour. Every item in here
                          was white on near-white. */}
                      <Link
                        href={item.href}
                        aria-current={location === item.href ? "page" : undefined}
                        className={`block rounded-full px-4 py-3 font-medium transition-colors duration-200 ${
                          location === item.href
                            ? "bg-header font-semibold text-header-foreground shadow-sm"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {item.text}
                      </Link>
                    </li>
                  ))}

                  {user ? (
                    <li>
                      <button
                        onClick={() => logoutMutation.mutate()}
                        disabled={logoutMutation.isPending}
                        className="flex w-full items-center rounded-full px-4 py-3 font-semibold text-foreground transition-colors duration-200 hover:bg-muted" 
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        <span>Logout ({user.username})</span>
                      </button>
                    </li>
                  ) : (
                    <li>
                      <Link
                        href="/auth"
                        className="flex items-center rounded-full px-4 py-3 font-semibold text-foreground transition-colors duration-200 hover:bg-muted" 
                      >
                        <User className="mr-2 h-5 w-5" />
                        <span>Login / Register</span>
                      </Link>
                    </li>
                  )}
                </ul>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}