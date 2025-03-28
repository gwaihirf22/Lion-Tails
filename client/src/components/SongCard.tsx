import { useState } from "react";
import { Song } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Music, Play, Pause } from "lucide-react";

interface SongCardProps {
  song: Song;
}

// Guitar chord fingering visualization helper
const renderChord = (chord: any) => {
  if (!chord || !chord.fingering) return null;
  
  return (
    <div className="h-20 w-16 bg-white/90 rounded-md flex flex-col items-center justify-center border border-secondary/30 text-xs relative">
      <div className="absolute top-1 left-0 right-0 text-center font-medium text-primary">
        {chord.name}
      </div>
      <div className="grid grid-cols-6 gap-[2px] mt-4">
        {[chord.fingering.string6, chord.fingering.string5, chord.fingering.string4, 
          chord.fingering.string3, chord.fingering.string2, chord.fingering.string1].map((fretNum, i) => (
          <div key={i} className="flex flex-col items-center">
            {fretNum === -1 ? (
              <div className="w-2 h-2 mb-1">✕</div>
            ) : fretNum === 0 ? (
              <div className="w-2 h-2 mb-1">○</div>
            ) : (
              <div className="w-3 h-3 rounded-full bg-primary text-white flex items-center justify-center">
                {fretNum}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function SongCard({ song }: SongCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    // In a real app, we would play/pause the audio here
  };

  // Helper to render verses with chords
  const renderLyricsWithChords = (verse: { lyrics: string[], chords: string[] }) => {
    if (!verse || !verse.lyrics) return null;
    return verse.lyrics.map((line, idx) => (
      <p key={idx} className="flex items-center gap-2">
        <span className="min-w-10 text-center font-mono text-xs text-secondary">
          {verse.chords && verse.chords[idx] ? verse.chords[idx] : ""}
        </span> 
        <span>{line}</span>
      </p>
    ));
  };

  return (
    <Card className={`${song.backgroundColor || 'bg-primary/10'} rounded-xl p-5 hover:shadow-md transition duration-200`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xl font-heading font-medium">{song.title}</h3>
            {song.artist && <p className="text-sm text-muted-foreground">by {song.artist}</p>}
          </div>
          <Button 
            onClick={togglePlay} 
            className={`p-2 ${isPlaying ? 'bg-red-500' : 'bg-primary'} rounded-full hover:bg-primary/80 transition`}
            size="icon"
          >
            {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white" />}
          </Button>
        </div>
        
        <div className="space-y-4 font-serif mb-4">
          {/* Verses */}
          {song.verses && song.verses.map((verse, i) => (
            <div key={i} className="space-y-1">
              {i > 0 && <div className="h-1 w-12 bg-secondary/20 rounded my-2"></div>}
              {renderLyricsWithChords(verse)}
            </div>
          ))}

          {/* Chorus */}
          {song.chorus && (
            <div className="space-y-1 bg-white/30 p-2 rounded-md">
              <p className="text-xs uppercase text-muted-foreground tracking-wider font-sans mb-1">Chorus</p>
              {renderLyricsWithChords(song.chorus)}
            </div>
          )}

          {/* Bridge */}
          {song.bridge && (
            <div className="space-y-1 bg-white/20 p-2 rounded-md">
              <p className="text-xs uppercase text-muted-foreground tracking-wider font-sans mb-1">Bridge</p>
              {renderLyricsWithChords(song.bridge)}
            </div>
          )}
        </div>
        
        {/* Chords display */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {song.chords && song.chords.map((chord, index) => (
            <div key={index} className="text-center">
              {renderChord(chord)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
