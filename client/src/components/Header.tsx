import { Link, useLocation } from "wouter";

export default function Header() {
  const [location] = useLocation();

  return (
    <header className="bg-primary/90 shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img 
            src="https://images.unsplash.com/photo-1559526324-593bc073d938?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80" 
            alt="Dreamy Tales Logo" 
            className="w-12 h-12 rounded-full"
          />
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">Dreamy Tales</h1>
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
                href="/story" 
                className={`text-white hover:text-accent duration-200 px-2 py-1 rounded ${location === '/story' ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
              >
                Story
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
