import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { type Song, type ChordDiagram } from '@shared/schema';
import { ChevronDown, ChevronUp, Music, Info, Play, Pause } from 'lucide-react';

interface SongDisplayProps {
  song: Song;
}

const SongDisplay: React.FC<SongDisplayProps> = ({ song }) => {
  const [showChords, setShowChords] = useState(true);
  const [chordDiagramOpen, setChordDiagramOpen] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  
  const toggleAudio = () => {
    // Placeholder for audio playback functionality
    setAudioPlaying(!audioPlaying);
    // TODO: Implement actual audio playback when audio URLs are available
  };
  
  const handleShowChords = (checked: boolean) => {
    setShowChords(checked);
  };
  
  // Helper function to render a chord diagram
  const renderChordDiagram = (chord: ChordDiagram) => {
    const stringCount = 6;
    const fretCount = 5;
    
    // Determine which frets to display based on position
    const position = chord.position || 1;
    const fretStart = position > 1 ? position : 1;
    
    return (
      <div key={chord.name} className="inline-block mr-4 mb-4">
        <div className="text-center mb-1 font-semibold">{chord.name}</div>
        <div className="border border-border rounded p-2 bg-muted/20">
          <svg width="80" height="100" viewBox="0 0 80 100">
            {/* Frets (horizontal lines) */}
            {Array.from({ length: fretCount + 1 }).map((_, i) => (
              <line
                key={`fret-${i}`}
                x1="10"
                y1={15 + i * 15}
                x2="70"
                y2={15 + i * 15}
                stroke="currentColor"
                strokeWidth={i === 0 && position === 1 ? 3 : 1}
              />
            ))}
            
            {/* Strings (vertical lines) */}
            {Array.from({ length: stringCount }).map((_, i) => (
              <line
                key={`string-${i}`}
                x1={10 + i * 12}
                y1="15"
                x2={10 + i * 12}
                y2={15 + fretCount * 15}
                stroke="currentColor"
                strokeWidth="1"
              />
            ))}
            
            {/* Position marker */}
            {position > 1 && (
              <text x="5" y="25" fontSize="10" fill="currentColor">
                {position}
              </text>
            )}
            
            {/* String marks (fingers, open, muted) */}
            {[
              chord.fingering.string6,
              chord.fingering.string5,
              chord.fingering.string4,
              chord.fingering.string3,
              chord.fingering.string2,
              chord.fingering.string1,
            ].map((fret, i) => {
              const xPos = 10 + i * 12;
              if (fret === -1) {
                // Muted string
                return (
                  <text
                    key={`mute-${i}`}
                    x={xPos}
                    y="10"
                    fontSize="12"
                    textAnchor="middle"
                    fill="currentColor"
                  >
                    ×
                  </text>
                );
              } else if (fret === 0) {
                // Open string
                return (
                  <text
                    key={`open-${i}`}
                    x={xPos}
                    y="10"
                    fontSize="12"
                    textAnchor="middle"
                    fill="currentColor"
                  >
                    ○
                  </text>
                );
              } else {
                // Finger position
                const fretPositionY = 15 + (fret - fretStart + 0.5) * 15;
                if (fretPositionY >= 15 && fretPositionY <= 15 + fretCount * 15) {
                  return (
                    <circle
                      key={`finger-${i}`}
                      cx={xPos}
                      cy={fretPositionY}
                      r="5"
                      fill="currentColor"
                    />
                  );
                }
                return null;
              }
            })}
            
            {/* Barres (if any) */}
            {chord.barres?.map((barre, idx) => {
              const fromX = 10 + (barre.fromString - 1) * 12;
              const toX = 10 + (barre.toString - 1) * 12;
              const yPos = 15 + (barre.fret - fretStart + 0.5) * 15;
              
              if (yPos >= 15 && yPos <= 15 + fretCount * 15) {
                return (
                  <line
                    key={`barre-${idx}`}
                    x1={fromX}
                    y1={yPos}
                    x2={toX}
                    y2={yPos}
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeOpacity="0.7"
                    strokeLinecap="round"
                  />
                );
              }
              return null;
            })}
          </svg>
        </div>
      </div>
    );
  };
  
  return (
    <div className="w-full text-left">
      {/* Audio player (if available) */}
      {song.audioUrl && (
        <div className="mb-4 flex items-center">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2"
            onClick={toggleAudio}
          >
            {audioPlaying ? (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Play
              </>
            )}
          </Button>
          <audio 
            src={song.audioUrl} 
            controls 
            className="ml-4 w-full max-w-md" 
            hidden={!audioPlaying}
          />
        </div>
      )}
      
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-chords" 
            checked={showChords} 
            onCheckedChange={handleShowChords} 
          />
          <Label htmlFor="show-chords">Show Chords</Label>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1"
          onClick={() => setChordDiagramOpen(!chordDiagramOpen)}
        >
          <Music className="h-4 w-4" />
          Chord Diagrams
          {chordDiagramOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        
        {/* Additional song metadata */}
        <div className="text-sm text-muted-foreground ml-auto flex items-center">
          <span className="mr-4">Key: {song.key}</span>
          <span className="mr-4">{song.tempo} BPM</span>
          <span className="mr-4">{song.timeSignature}</span>
          <span>{song.difficulty}</span>
        </div>
      </div>
      
      {/* Chord diagrams */}
      <Collapsible open={chordDiagramOpen} onOpenChange={setChordDiagramOpen}>
        <CollapsibleContent>
          <div className="mb-4 p-4 border rounded-md bg-muted/20">
            <h3 className="text-sm font-medium mb-2">Chord Diagrams</h3>
            <div className="flex flex-wrap">
              {song.chords.map(renderChordDiagram)}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Song content */}
      <div className="space-y-6 py-2">
        {/* Verses */}
        {song.verses.map((verse, verseIdx) => (
          <div key={`verse-${verseIdx}`} className="space-y-1">
            <h3 className="text-sm font-medium mb-1 text-muted-foreground">
              Verse {verseIdx + 1}
            </h3>
            {verse.lyrics.map((line, lineIdx) => (
              <div key={`verse-${verseIdx}-line-${lineIdx}`}>
                {showChords && verse.chords && verse.chords[lineIdx] && (
                  <div className="text-sm font-mono text-primary">
                    {verse.chords[lineIdx]}
                  </div>
                )}
                <div>{line}</div>
              </div>
            ))}
          </div>
        ))}
        
        {/* Chorus */}
        {song.chorus && (
          <div className="space-y-1 border-l-4 pl-3 border-primary">
            <h3 className="text-sm font-medium mb-1 text-muted-foreground">
              Chorus
            </h3>
            {song.chorus.lyrics.map((line, lineIdx) => (
              <div key={`chorus-line-${lineIdx}`}>
                {showChords && song.chorus?.chords && song.chorus.chords[lineIdx] && (
                  <div className="text-sm font-mono text-primary">
                    {song.chorus.chords[lineIdx]}
                  </div>
                )}
                <div>{line}</div>
              </div>
            ))}
          </div>
        )}
        
        {/* Bridge */}
        {song.bridge && (
          <div className="space-y-1 border-l-4 pl-3 border-secondary">
            <h3 className="text-sm font-medium mb-1 text-muted-foreground">
              Bridge
            </h3>
            {song.bridge.lyrics.map((line, lineIdx) => (
              <div key={`bridge-line-${lineIdx}`}>
                {showChords && song.bridge?.chords && song.bridge.chords[lineIdx] && (
                  <div className="text-sm font-mono text-primary">
                    {song.bridge.chords[lineIdx]}
                  </div>
                )}
                <div>{line}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SongDisplay;