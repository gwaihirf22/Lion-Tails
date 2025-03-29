import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import appIcon from "@/assets/app-icon.jpg";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Header() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

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
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className="text-white p-2 focus:outline-none z-50"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          ) : (
            <nav>
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
                </ul>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
