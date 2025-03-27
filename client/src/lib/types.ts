export interface ChordData {
  name: string;
  fingering: {
    string1: number; // First string (high E) - 0 means open, -1 means don't play
    string2: number; // B
    string3: number; // G
    string4: number; // D
    string5: number; // A
    string6: number; // Low E
  };
  barres?: {
    fromString: number;
    toString: number;
    fret: number;
  }[];
  position?: number;  // Optional position marker
}
