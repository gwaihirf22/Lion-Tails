import { useState } from "react";
import { Song } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SongCardProps {
  song: Song;
}

const chordImages: Record<string, string> = {
  C: "/src/assets/chords/C.svg",
  D: "/src/assets/chords/D.svg",
  D7: "/src/assets/chords/D7.svg",
  F: "/src/assets/chords/F.svg",
  G: "/src/assets/chords/G.svg",
  G7: "/src/assets/chords/G7.svg",
};

export default function SongCard({ song }: SongCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    // In a real app, we would play/pause the audio here
  };

  return (
    <Card className={`${song.backgroundColor || 'bg-primary/10'} rounded-xl p-5 hover:shadow-md transition duration-200`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-heading font-medium">{song.title}</h3>
          <Button 
            onClick={togglePlay} 
            className={`p-2 ${isPlaying ? 'bg-red-500' : 'bg-primary'} rounded-full hover:bg-primary/80 transition`}
            size="icon"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </Button>
        </div>
        
        <div className="space-y-2 font-serif mb-4">
          {song.lyrics.map((line, index) => (
            <p key={index} className="flex items-center">
              <span className="w-10 text-center font-mono text-secondary">{line.chord || ""}</span> {line.text}
            </p>
          ))}
        </div>
        
        <div className="flex justify-center mt-6">
          <div className="flex space-x-3">
            {song.chords.map((chord, index) => (
              <div key={index} className="text-center">
                <div className="h-14 w-12 bg-secondary/10 rounded-md flex items-center justify-center border border-secondary/30">
                  <span className="font-medium text-secondary">{chord}</span>
                </div>
                {chordImages[chord] && (
                  <img src={chordImages[chord]} alt={`${chord} chord`} className="h-16 mt-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
