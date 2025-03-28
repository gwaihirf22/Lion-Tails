import { Link, useLocation } from "wouter";
// Import the SVG as an asset
import aslanIcon from "@/assets/aslan-lion.svg";

export default function Header() {
  const [location] = useLocation();

  // App name: "Lion Tails" - references Aslan/Jesus symbolism with a simple, memorable name that kids can easily remember
  
  return (
    <header className="bg-primary/90 shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img 
            src={aslanIcon} 
            alt="Lion Tails Logo" 
            className="w-12 h-12 rounded-full object-cover bg-white p-1"
          />
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">Lion Tails</h1>
        </div>
        <nav>
          <ul className="flex space-x-4 font-heading">
            <li>
              <Link 
                href="/" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                Home
              </Link>
            </li>
            <li>
              <Link 
                href="/music" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/music' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                Music
              </Link>
            </li>
            <li>
              <Link 
                href="/saved-stories" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/saved-stories' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                My Stories
              </Link>
            </li>
            <li>
              <Link 
                href="/characters" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/characters' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                Characters
              </Link>
            </li>
            <li>
              <Link 
                href="/settings" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/settings' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                Settings
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
