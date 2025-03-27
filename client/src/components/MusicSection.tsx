import { Song } from "@shared/schema";
import SongCard from "./SongCard";

interface MusicSectionProps {
  songs: Song[];
}

export default function MusicSection({ songs }: MusicSectionProps) {
  return (
    <section className="mt-4">
      <div 
        className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6"
        style={{ 
          backgroundImage: `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJjbG91ZHMiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjQwIiBjeT0iNDAiIHI9IjE1Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjYwIiBjeT0iNDUiIHI9IjE4Ii8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjUwIiBjeT0iMzAiIHI9IjIwIi8+PGNpcmNsZSBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjE2MCIgY3k9IjE2MCIgcj0iMTUiLz48Y2lyY2xlIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4yIiBjeD0iMTgwIiBjeT0iMTY1IiByPSIxOCIvPjxjaXJjbGUgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjIiIGN4PSIxNzAiIGN5PSIxNTAiIHI9IjIwIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2Nsb3VkcykiLz48L3N2Zz4=')` 
        }}
      >
        <h2 className="text-3xl font-heading font-bold mb-6 text-textDark text-center">Bedtime Songs</h2>
        <p className="text-center mb-8">Simple Christian songs with guitar chords to sing with your little ones before bed</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      </div>
    </section>
  );
}
