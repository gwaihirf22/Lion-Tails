import { Link, useLocation } from "wouter";
// Import the Lion Tails image
import appIcon from "@/assets/app-icon.jpg";

export default function Header() {
  const [location] = useLocation();

  // App name: "Lion Tails" - references Aslan/Jesus symbolism with a simple, memorable name that kids can easily remember
  
  return (
    <header className="bg-primary/60 backdrop-blur-md shadow-lg border-b border-white/10">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <img 
            src={appIcon} 
            alt="Lion Tails Logo" 
            className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-lg"
          />
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white drop-shadow-lg">Lion Tails</h1>
        </div>
        <nav>
          <ul className="flex space-x-2 font-heading text-sm md:text-base">
            <li>
              <Link 
                href="/" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
              >
                Home
              </Link>
            </li>
            <li>
              <Link 
                href="/music" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/music' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
              >
                Music
              </Link>
            </li>
            <li>
              <Link 
                href="/saved-stories" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/saved-stories' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
              >
                My Stories
              </Link>
            </li>
            <li>
              <Link 
                href="/characters" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/characters' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
              >
                Characters
              </Link>
            </li>
            <li>
              <Link 
                href="/heroes-of-faith" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/heroes-of-faith' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
              >
                Heroes
              </Link>
            </li>
            <li>
              <Link 
                href="/settings" 
                className={`text-white hover:text-accent/90 duration-200 px-3 py-1.5 rounded-full ${location === '/settings' ? 'bg-white/20 font-bold shadow-inner' : 'hover:bg-white/10'}`}
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
