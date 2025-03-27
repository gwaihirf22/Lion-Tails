// Bible verses organized by theme

interface BibleVerse {
  text: string;
  reference: string;
}

interface VerseCollection {
  [theme: string]: BibleVerse[];
}

const verses: VerseCollection = {
  kindness: [
    {
      text: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.",
      reference: "Ephesians 4:32"
    },
    {
      text: "Whoever pursues righteousness and kindness will find life, righteousness, and honor.",
      reference: "Proverbs 21:21"
    },
    {
      text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud.",
      reference: "1 Corinthians 13:4"
    }
  ],
  courage: [
    {
      text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
      reference: "Joshua 1:9"
    },
    {
      text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.",
      reference: "2 Timothy 1:7"
    },
    {
      text: "Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
      reference: "Joshua 1:9"
    }
  ],
  obedience: [
    {
      text: "If you love me, keep my commands.",
      reference: "John 14:15"
    },
    {
      text: "Children, obey your parents in the Lord, for this is right.",
      reference: "Ephesians 6:1"
    },
    {
      text: "Blessed rather are those who hear the word of God and obey it.",
      reference: "Luke 11:28"
    }
  ],
  forgiveness: [
    {
      text: "Bear with each other and forgive one another if any of you has a grievance against someone. Forgive as the Lord forgave you.",
      reference: "Colossians 3:13"
    },
    {
      text: "For if you forgive other people when they sin against you, your heavenly Father will also forgive you.",
      reference: "Matthew 6:14"
    },
    {
      text: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.",
      reference: "Ephesians 4:32"
    }
  ],
  gratitude: [
    {
      text: "Give thanks in all circumstances; for this is God's will for you in Christ Jesus.",
      reference: "1 Thessalonians 5:18"
    },
    {
      text: "Enter his gates with thanksgiving and his courts with praise; give thanks to him and praise his name.",
      reference: "Psalm 100:4"
    },
    {
      text: "And whatever you do, whether in word or deed, do it all in the name of the Lord Jesus, giving thanks to God the Father through him.",
      reference: "Colossians 3:17"
    }
  ],
  patience: [
    {
      text: "Be completely humble and gentle; be patient, bearing with one another in love.",
      reference: "Ephesians 4:2"
    },
    {
      text: "But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness, gentleness and self-control.",
      reference: "Galatians 5:22-23"
    },
    {
      text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud.",
      reference: "1 Corinthians 13:4"
    }
  ],
  faith: [
    {
      text: "Now faith is confidence in what we hope for and assurance about what we do not see.",
      reference: "Hebrews 11:1"
    },
    {
      text: "For we live by faith, not by sight.",
      reference: "2 Corinthians 5:7"
    },
    {
      text: "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.",
      reference: "Isaiah 41:10"
    }
  ],
  honesty: [
    {
      text: "The Lord detests lying lips, but he delights in people who are trustworthy.",
      reference: "Proverbs 12:22"
    },
    {
      text: "Whoever walks in integrity walks securely, but whoever takes crooked paths will be found out.",
      reference: "Proverbs 10:9"
    },
    {
      text: "Therefore each of you must put off falsehood and speak truthfully to your neighbor, for we are all members of one body.",
      reference: "Ephesians 4:25"
    }
  ]
};

// Default verse if the theme is not found
const defaultVerse: BibleVerse = {
  text: "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.",
  reference: "Isaiah 41:10"
};

export function getBibleVerseByTheme(theme: string): BibleVerse {
  const lowerTheme = theme.toLowerCase();
  
  if (verses[lowerTheme]) {
    const themeVerses = verses[lowerTheme];
    return themeVerses[Math.floor(Math.random() * themeVerses.length)];
  }
  
  return defaultVerse;
}
