import { Link, useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Menu, X, LogOut, User, ChevronDown, MoreHorizontal, Loader2 } from "lucide-react";
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
    { href: "/settings", text: "Settings" },
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

      if (width > 1200) {
        setVisibleItems(6); 
      } else if (width > 1000) {
        setVisibleItems(5); 
      } else if (width > 800) {
        setVisibleItems(4); 
      } else if (width > 640) {
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
      <header className="bg-primary/80 backdrop-blur-md shadow-lg border-b border-white/20 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div ref={logoContainerRef} className="flex items-center space-x-3">
            <img 
              src={appIcon} 
              alt="Lion Tails Logo" 
              className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-2 border-white shadow-lg"
            />
            <h1 className="text-xl md:text-3xl font-heading font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">Lion Tails</h1>

            {/* The affordance that makes navigating away feel safe. The Header
                is sticky and always mounted, so this is visible from every
                page while a story is being written. */}
            {activeJobs.length > 0 && (
              <Link href="/library">
                <span
                  className="hidden sm:flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs text-white cursor-pointer hover:bg-white/30 transition"
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
              {user && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => logoutMutation.mutate()} 
                  className="text-white"
                  disabled={logoutMutation.isPending}
                >
                  <LogOut size={20} />
                </Button>
              )}
              <button 
                onClick={() => setMenuOpen(!menuOpen)} 
                className="text-white p-2 focus:outline-none z-50"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
              >
                {menuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <nav className="mr-4">
                <ul ref={navContainerRef} className="flex space-x-2 font-heading text-sm md:text-base">
                  {visibleNavItems.map((item) => (
                    <li key={item.href}>
                      <Link 
                        href={item.href} 
                        className={`nav-text hover:text-white duration-200 px-3 py-1.5 rounded-full ${location === item.href ? 'bg-white/30 font-bold shadow-inner' : 'hover:bg-white/20'}`}
                      >
                        {item.text}
                      </Link>
                    </li>
                  ))}

                  {hasOverflow && (
                    <li>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center nav-text hover:text-white duration-200 px-3 py-1.5 rounded-full hover:bg-white/20">
                            <span className="mr-1">More</span>
                            <ChevronDown size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-primary/95 backdrop-blur-md border-white/20 shadow-lg">
                          {overflowNavItems.map((item) => (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link 
                                href={item.href}
                                className={`w-full px-2 py-1.5 rounded-sm nav-text ${location === item.href ? 'bg-white/30 font-bold' : 'hover:bg-white/20'}`}
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
                  <span className="nav-text mr-2 hidden md:block">
                    {user.username}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    className="text-white text-shadow-sm border-white/40 hover:bg-white/30 hover:text-white font-bold shadow-md" 
                  >
                    <LogOut className="mr-1 h-4 w-4" />
                    <span>Logout</span>
                  </Button>
                </div>
              ) : (
                <Link href="/auth">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-white text-shadow-sm border-white/40 hover:bg-white/30 hover:text-white font-bold shadow-md" 
                  >
                    <User className="mr-1 h-4 w-4" />
                    <span>Login</span>
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {isMobile && menuOpen && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/40" 
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute top-0 right-0 left-0 pt-20 pb-4 px-4 bg-primary/95 backdrop-blur-md shadow-lg border-b border-white/20 max-h-screen overflow-y-auto">
            <div className="container mx-auto">
              <nav>
                <ul className="flex flex-col space-y-2 font-heading text-base">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link 
                        href={item.href} 
                        className={`block nav-text hover:text-white duration-200 px-4 py-3 rounded-full ${location === item.href ? 'bg-white/30 font-bold shadow-inner' : 'hover:bg-white/20'}`}
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
                        className="flex items-center w-full nav-text hover:text-white duration-200 px-4 py-3 rounded-full hover:bg-white/20 font-bold shadow-sm" 
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        <span>Logout ({user.username})</span>
                      </button>
                    </li>
                  ) : (
                    <li>
                      <Link
                        href="/auth"
                        className="flex items-center nav-text hover:text-white duration-200 px-4 py-3 rounded-full hover:bg-white/20 font-bold shadow-sm" 
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