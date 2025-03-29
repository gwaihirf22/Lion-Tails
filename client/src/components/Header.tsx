import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Menu, X, LogOut, User } from "lucide-react";
import appIcon from "@/assets/app-icon.jpg";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  // Close menu on location change
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Close menu on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Prevent body scroll when menu is open on mobile
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

  const navItems = [
    { href: "/", text: "Home" },
    { href: "/music", text: "Music" },
    { href: "/saved-stories", text: "My Stories" },
    { href: "/characters", text: "Characters" },
    { href: "/heroes-of-faith", text: "Heroes" },
    { href: "/settings", text: "Settings" },
  ];
  
  return (
    <>
      <header className="bg-primary/60 backdrop-blur-md shadow-lg border-b border-white/10 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img 
              src={appIcon} 
              alt="Lion Tails Logo" 
              className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-2 border-white shadow-lg"
            />
            <h1 className="text-xl md:text-3xl font-heading font-bold text-white drop-shadow-lg">Lion Tails</h1>
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
                <ul className="flex space-x-2 font-heading text-sm md:text-base">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link 
                        href={item.href} 
                        className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === item.href ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
                      >
                        {item.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              
              {user ? (
                <div className="flex items-center">
                  <span className="text-white mr-2 hidden md:block">
                    {user.username}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    className="text-white border-white/20 hover:bg-white/10 hover:text-white"
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
                    className="text-white border-white/20 hover:bg-white/10 hover:text-white"
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

      {/* Mobile menu - completely separate from the header */}
      {isMobile && menuOpen && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/40" 
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          
          {/* Menu Content */}
          <div className="absolute top-0 right-0 left-0 pt-20 pb-4 px-4 bg-primary/95 backdrop-blur-md shadow-lg border-b border-white/10 max-h-screen overflow-y-auto">
            <div className="container mx-auto">
              <nav>
                <ul className="flex flex-col space-y-2 font-heading text-base">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link 
                        href={item.href} 
                        className={`block text-white hover:text-accent/90 duration-200 px-4 py-3 rounded-full ${location === item.href ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
                      >
                        {item.text}
                      </Link>
                    </li>
                  ))}
                  
                  {/* Auth actions for mobile */}
                  {user ? (
                    <li>
                      <button
                        onClick={() => logoutMutation.mutate()}
                        disabled={logoutMutation.isPending}
                        className="flex items-center w-full text-white hover:text-accent/90 duration-200 px-4 py-3 rounded-full hover:bg-white/10"
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        <span>Logout ({user.username})</span>
                      </button>
                    </li>
                  ) : (
                    <li>
                      <Link
                        href="/auth"
                        className="flex items-center text-white hover:text-accent/90 duration-200 px-4 py-3 rounded-full hover:bg-white/10"
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
