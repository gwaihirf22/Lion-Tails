import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Menu, X } from "lucide-react";
// Import the Lion Tails image
import appIcon from "@/assets/app-icon.jpg";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Header() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  // App name: "Lion Tails" - references Aslan/Jesus symbolism with a simple, memorable name that kids can easily remember
  
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const navItems = [
    { href: "/", text: "Home" },
    { href: "/music", text: "Music" },
    { href: "/saved-stories", text: "My Stories" },
    { href: "/characters", text: "Characters" },
    { href: "/heroes-of-faith", text: "Heroes" },
    { href: "/settings", text: "Settings" },
  ];
  
  return (
    <header className="bg-primary/60 backdrop-blur-md shadow-lg border-b border-white/10">
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
          // Mobile menu
          <div>
            <button 
              onClick={toggleMenu} 
              className="text-white p-2 focus:outline-none"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            
            {menuOpen && (
              <>
                {/* Overlay to capture clicks outside the menu */}
                <div 
                  className="fixed inset-0 bg-black/20 z-[90]" 
                  onClick={closeMenu}
                  aria-hidden="true"
                />
                
                {/* Mobile menu */}
                <div className="fixed top-[72px] right-0 left-0 bg-primary/95 backdrop-blur-md z-[100] p-4 shadow-lg border-b border-white/10">
                  <nav className="container mx-auto">
                    <ul className="flex flex-col space-y-2 font-heading text-base">
                      {navItems.map((item) => (
                        <li key={item.href}>
                          <Link 
                            href={item.href} 
                            className={`block text-white hover:text-accent/90 duration-200 px-3 py-2 rounded-full ${location === item.href ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
                            onClick={closeMenu}
                          >
                            {item.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
              </>
            )}
          </div>
        ) : (
          // Desktop menu
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
  );
}
