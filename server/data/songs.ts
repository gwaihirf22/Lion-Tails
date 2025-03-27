import { Song } from "@shared/schema";

export const songs: Song[] = [
  {
    id: "jesus-loves-me",
    title: "Jesus Loves Me",
    lyrics: [
      { text: "Jesus loves me! This I know,", chord: "G" },
      { text: "For the Bible tells me so;", chord: "C" },
      { text: "Little ones to Him belong;", chord: "G" },
      { text: "They are weak, but He is strong.", chord: "D7 G" },
      { text: "" },
      { text: "Yes, Jesus loves me!", chord: "G" },
      { text: "Yes, Jesus loves me!", chord: "C" },
      { text: "Yes, Jesus loves me!", chord: "G" },
      { text: "The Bible tells me so.", chord: "D7 G" }
    ],
    chords: ["G", "C", "D7"],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "this-little-light",
    title: "This Little Light of Mine",
    lyrics: [
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "G7" },
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "G7" },
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "F" },
      { text: "Let it shine, let it shine, let it shine.", chord: "C G7 C" }
    ],
    chords: ["C", "G7", "F"],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "he-has-the-whole-world",
    title: "He's Got the Whole World in His Hands",
    lyrics: [
      { text: "He's got the whole world in His hands", chord: "G" },
      { text: "He's got the whole world in His hands", chord: "C G" },
      { text: "He's got the whole world in His hands", chord: "D7" },
      { text: "He's got the whole world in His hands", chord: "G" },
      { text: "" },
      { text: "He's got the little bitty baby in His hands", chord: "G" },
      { text: "He's got the little bitty baby in His hands", chord: "C G" },
      { text: "He's got the little bitty baby in His hands", chord: "D7" },
      { text: "He's got the whole world in His hands", chord: "G" }
    ],
    chords: ["G", "C", "D7"],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    lyrics: [
      { text: "Amazing grace! How sweet the sound", chord: "G" },
      { text: "That saved a wretch like me!", chord: "C G" },
      { text: "I once was lost, but now am found;", chord: "G D" },
      { text: "Was blind, but now I see.", chord: "G" },
      { text: "" },
      { text: "'Twas grace that taught my heart to fear,", chord: "G" },
      { text: "And grace my fears relieved;", chord: "C G" },
      { text: "How precious did that grace appear", chord: "G D" },
      { text: "The hour I first believed.", chord: "G" }
    ],
    chords: ["G", "C", "D"],
    backgroundColor: "bg-primary/10"
  }
];
