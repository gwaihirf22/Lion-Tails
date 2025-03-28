import { Song } from "@shared/schema";

// Common chord definitions for reuse
const commonChords = {
  G: {
    name: "G",
    fingering: {
      string1: 3,
      string2: 0,
      string3: 0,
      string4: 0,
      string5: 2,
      string6: 3
    },
    barres: [],
    position: 1
  },
  C: {
    name: "C",
    fingering: {
      string1: 0,
      string2: 1,
      string3: 0,
      string4: 2,
      string5: 3,
      string6: -1
    },
    barres: [],
    position: 1
  },
  D: {
    name: "D",
    fingering: {
      string1: 2,
      string2: 3,
      string3: 2,
      string4: 0,
      string5: -1,
      string6: -1
    },
    barres: [],
    position: 1
  },
  Em: {
    name: "Em",
    fingering: {
      string1: 0,
      string2: 0,
      string3: 0,
      string4: 2,
      string5: 2,
      string6: 0
    },
    barres: [],
    position: 1
  },
  A: {
    name: "A",
    fingering: {
      string1: 0,
      string2: 2,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    barres: [],
    position: 1
  },
  D7: {
    name: "D7",
    fingering: {
      string1: 2,
      string2: 1,
      string3: 2,
      string4: 0,
      string5: -1,
      string6: -1
    },
    barres: [],
    position: 1
  },
  G7: {
    name: "G7",
    fingering: {
      string1: 1,
      string2: 0,
      string3: 0,
      string4: 0,
      string5: 2,
      string6: 3
    },
    barres: [],
    position: 1
  },
  F: {
    name: "F",
    fingering: {
      string1: 1,
      string2: 1,
      string3: 2,
      string4: 3,
      string5: 3,
      string6: 1
    },
    barres: [
      {
        fromString: 1,
        toString: 6,
        fret: 1
      }
    ],
    position: 1
  },
  Am: {
    name: "Am",
    fingering: {
      string1: 0,
      string2: 1,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    barres: [],
    position: 1
  }
};

// Children's Songs
export const childrenSongs: Song[] = [
  {
    id: "gods-love-is-so-wonderful",
    title: "God's Love Is So Wonderful",
    artist: "Traditional",
    verses: [
      {
        lyrics: ["God's love is so wonderful,", "God's love is so wonderful,", "God's love is so wonderful,", "Oh, wonderful love!"],
        chords: ["G", "C", "G", "D G"]
      }
    ],
    chorus: {
      lyrics: ["So high, you can't get over it,", "So low, you can't get under it,", "So wide, you can't get around it,", "Oh, wonderful love!"],
      chords: ["G", "C", "G", "D G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "i-have-decided",
    title: "I Have Decided to Follow Jesus",
    artist: "S. Sundar Singh",
    verses: [
      {
        lyrics: ["I have decided to follow Jesus,", "I have decided to follow Jesus,", "I have decided to follow Jesus,", "No turning back, no turning back."],
        chords: ["G", "C G", "D", "G"]
      },
      {
        lyrics: ["The world behind me, the cross before me,", "The world behind me, the cross before me,", "The world behind me, the cross before me,", "No turning back, no turning back."],
        chords: ["G", "C G", "D", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "my-god-is-so-big",
    title: "My God Is So Big",
    artist: "Ruth Harms Calkin",
    verses: [
      {
        lyrics: ["My God is so big, so strong and so mighty,", "There's nothing my God cannot do.", "My God is so big, so strong and so mighty,", "There's nothing my God cannot do."],
        chords: ["G", "C G", "D", "G"]
      }
    ],
    chorus: {
      lyrics: ["The mountains are His, the rivers are His,", "The stars are His handiwork too.", "My God is so big, so strong and so mighty,", "There's nothing my God cannot do."],
      chords: ["G", "C", "D", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "fishers-of-men",
    title: "I Will Make You Fishers of Men",
    artist: "Harry D. Clarke",
    verses: [
      {
        lyrics: ["I will make you fishers of men,", "Fishers of men, fishers of men.", "I will make you fishers of men,", "If you follow Me."],
        chords: ["G", "C", "G", "D G"]
      }
    ],
    chorus: {
      lyrics: ["If you follow Me,", "If you follow Me,", "I will make you fishers of men,", "If you follow Me."],
      chords: ["G", "C", "G D", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "fathers-abraham",
    title: "Father Abraham",
    artist: "Traditional",
    verses: [
      {
        lyrics: ["Father Abraham had many sons,", "Many sons had Father Abraham.", "I am one of them, and so are you,", "So let's just praise the Lord!"],
        chords: ["G", "C", "G", "D G"]
      }
    ],
    chorus: {
      lyrics: ["Right arm!", "Left arm!", "Right foot!", "Left foot!", "Chin up!", "Turn around!", "Sit down!"],
      chords: ["G", "G", "G", "G", "G", "G", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "all-night-all-day",
    title: "All Night, All Day",
    artist: "Traditional",
    verses: [
      {
        lyrics: ["All night, all day,", "Angels watching over me, my Lord.", "All night, all day,", "Angels watching over me."],
        chords: ["G", "C G", "D", "G"]
      },
      {
        lyrics: ["Now I lay me down to sleep,", "Angels watching over me, my Lord.", "Pray the Lord my soul to keep,", "Angels watching over me."],
        chords: ["G", "C", "D", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-secondary/10"
  }
];

// Classic Hymns
export const classicHymns: Song[] = [
  {
    id: "holy-holy-holy",
    title: "Holy, Holy, Holy",
    artist: "Reginald Heber",
    verses: [
      {
        lyrics: ["Holy, holy, holy! Lord God Almighty!", "Early in the morning our song shall rise to Thee;", "Holy, holy, holy, merciful and mighty!", "God in three Persons, blessed Trinity!"],
        chords: ["G", "C G", "D", "G"]
      },
      {
        lyrics: ["Holy, holy, holy! All the saints adore Thee,", "Casting down their golden crowns around the glassy sea;", "Cherubim and seraphim falling down before Thee,", "Who was, and is, and evermore shall be."],
        chords: ["G", "C G", "D", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "blessed-assurance",
    title: "Blessed Assurance",
    artist: "Fanny J. Crosby",
    verses: [
      {
        lyrics: ["Blessed assurance, Jesus is mine!", "Oh, what a foretaste of glory divine!", "Heir of salvation, purchase of God,", "Born of His Spirit, washed in His blood."],
        chords: ["G", "C", "G", "D"]
      }
    ],
    chorus: {
      lyrics: ["This is my story, this is my song,", "Praising my Savior all the day long;", "This is my story, this is my song,", "Praising my Savior all the day long."],
      chords: ["G", "C", "G D", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "rock-of-ages",
    title: "Rock of Ages",
    artist: "Augustus M. Toplady",
    verses: [
      {
        lyrics: ["Rock of Ages, cleft for me,", "Let me hide myself in Thee;", "Let the water and the blood,", "From Thy wounded side which flowed,", "Be of sin the double cure,", "Save from wrath and make me pure."],
        chords: ["G", "C", "G", "D", "C", "G"]
      },
      {
        lyrics: ["Not the labor of my hands", "Can fulfill Thy law's demands;", "Could my zeal no respite know,", "Could my tears forever flow,", "All for sin could not atone;", "Thou must save, and Thou alone."],
        chords: ["G", "C", "G", "D", "C", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "what-a-friend",
    title: "What a Friend We Have in Jesus",
    artist: "Joseph M. Scriven",
    verses: [
      {
        lyrics: ["What a friend we have in Jesus,", "All our sins and griefs to bear!", "What a privilege to carry", "Everything to God in prayer!", "Oh, what peace we often forfeit,", "Oh, what needless pain we bear,", "All because we do not carry", "Everything to God in prayer!"],
        chords: ["G", "C", "G", "D", "G", "C", "G D", "G"]
      },
      {
        lyrics: ["Have we trials and temptations?", "Is there trouble anywhere?", "We should never be discouraged—", "Take it to the Lord in prayer.", "Can we find a friend so faithful,", "Who will all our sorrows share?", "Jesus knows our every weakness;", "Take it to the Lord in prayer."],
        chords: ["G", "C", "G", "D", "G", "C", "G D", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "great-is-thy-faithfulness",
    title: "Great Is Thy Faithfulness",
    artist: "Thomas O. Chisholm",
    verses: [
      {
        lyrics: ["Great is Thy faithfulness, O God my Father,", "There is no shadow of turning with Thee;", "Thou changest not, Thy compassions, they fail not", "As Thou hast been Thou forever wilt be."],
        chords: ["G", "C", "G", "D"]
      }
    ],
    chorus: {
      lyrics: ["Great is Thy faithfulness! Great is Thy faithfulness!", "Morning by morning new mercies I see;", "All I have needed Thy hand hath provided—", "Great is Thy faithfulness, Lord, unto me!"],
      chords: ["G", "C", "G D", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "nothing-but-the-blood",
    title: "Nothing But the Blood",
    artist: "Robert Lowry",
    verses: [
      {
        lyrics: ["What can wash away my sin?", "Nothing but the blood of Jesus.", "What can make me whole again?", "Nothing but the blood of Jesus."],
        chords: ["G", "C", "G", "D"]
      }
    ],
    chorus: {
      lyrics: ["O precious is the flow", "That makes me white as snow;", "No other fount I know,", "Nothing but the blood of Jesus."],
      chords: ["G", "C", "G D", "G"]
    },
    bridge: null,
    chords: [commonChords.G, commonChords.C, commonChords.D],
    backgroundColor: "bg-secondary/10"
  }
];