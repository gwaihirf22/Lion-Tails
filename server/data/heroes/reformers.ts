import type { RawHero } from "./types";

/**
 * The Reformation. Several of these men died violently and several of them
 * approved of others dying violently; the complications field is not
 * decoration in this group.
 */
export const reformers: RawHero[] = [
  {
    id: "martin-luther",
    name: "Martin Luther",
    group: "reformers",
    wikipedia: "Martin Luther",
    timePeriod: "1483 - 1546",
    birthYear: "1483",
    deathYear: "1546",
    place: "Wittenberg, Germany",
    description:
      "A terrified monk who could not find peace with God, and whose answer split Western Christianity.",
    contribution:
      "Recovered justification by faith, put the Bible into German that ordinary people could read, and made the printing press a weapon.",
    biography:
      "Luther became a monk after a lightning storm frightened him into a vow, and he was a spectacularly bad one — not lazy, the opposite. He confessed for hours until his confessor lost patience, fasted until he damaged his health, and could not shake the conviction that God was righteous and he was not. He said later that he hated the phrase \"the righteousness of God\", because he understood it as the standard by which he would be condemned.\n\nStudying Romans as a lecturer at Wittenberg, he came to read it the other way round: that the righteousness of God in Paul is not a demand but a gift, received by faith. He described the moment as being born again and entering paradise through open gates.\n\nIn 1517 he posted ninety-five theses objecting to the sale of indulgences — certificates said to reduce punishment for sin, sold to fund a building project in Rome. He expected an academic argument. Printers turned it into a European crisis within weeks.\n\nSummoned to Worms in 1521 and ordered to recant, he asked for a night to think and then refused, saying his conscience was captive to the word of God. He was declared an outlaw, hidden in the Wartburg by a sympathetic prince, and translated the New Testament into German in eleven weeks.\n\nHe married Katharina von Bora, a former nun who had escaped her convent in a fish barrel, and their household became the model for Protestant family life. He wrote hymns, catechisms for children, and a great deal of very rude polemic.",
    complications:
      "Late in life he wrote On the Jews and Their Lies, a work of appalling violence that urged burning synagogues and expelling Jews from Germany. It was reprinted by the Nazis four centuries later. Lutheran bodies have formally repudiated it. He also urged the princes to crush the peasants' revolt of 1525 without mercy, and tens of thousands died.",
    famousQuote:
      "Here I stand. I can do no other.",
    bibleVerse: {
      text: "For in it the righteousness of God is revealed from faith for faith, as it is written, 'The righteous shall live by faith.'",
      reference: "Romans 1:17",
    },
    keyEvents: [
      { year: "1505", description: "Terrified by a lightning storm, vows to become a monk" },
      { year: "1517", description: "Publishes the Ninety-five Theses against indulgences" },
      { year: "1521", description: "Refuses to recant at the Diet of Worms and is declared an outlaw" },
      { year: "1522", description: "Translates the New Testament into German while hidden at the Wartburg" },
      { year: "1525", description: "Marries Katharina von Bora" },
      { year: "1529", description: "Writes the Small Catechism for families to teach children" },
    ],
    tags: ["reformation", "germany", "justification", "bible translation", "wittenberg", "monk", "hymns"],
    sources: [
      { title: "The Bondage of the Will", author: "Martin Luther", type: "book" },
      { title: "Martin Luther: Renegade and Prophet", author: "Lyndal Roper", type: "book" },
    ],
  },
  {
    id: "william-tyndale",
    name: "William Tyndale",
    group: "reformers",
    wikipedia: "William Tyndale",
    timePeriod: "c. 1494 - 1536",
    birthYear: "c. 1494",
    deathYear: "1536",
    place: "England and the Low Countries",
    description:
      "He was strangled and burned for translating the Bible into English — and most of the words in the King James Version are his.",
    contribution:
      "The first English New Testament translated from Greek and printed, and Old Testament work that shaped every English Bible after it.",
    biography:
      "Tyndale was an Oxford and Cambridge scholar who read Greek and Hebrew at a time when very few Englishmen did, and who became convinced that the English needed the Bible in their own tongue. Told by a learned man that they would be better off without God's law than the Pope's, he replied that if God spared his life he would make a boy who drives a plough know more of the Scriptures than his questioner did.\n\nEngland would not license the work, so he left and never returned. He printed his New Testament at Worms in 1526 and had copies smuggled into England in bales of cloth. The Bishop of London bought up quantities to burn them; the money funded a revised edition.\n\nHe moved constantly — Hamburg, Antwerp, Marburg — translating the Pentateuch and Jonah, revising, writing. He was betrayed by an Englishman named Henry Phillips who befriended him, arrested near Antwerp, and held in a castle for over a year. A surviving letter from prison asks for a warmer cap, a candle, and above all his Hebrew Bible, grammar and dictionary.\n\nHe was strangled and burned in 1536. His reported last words were a prayer that the King of England's eyes would be opened. Within four years, Henry VIII authorised an English Bible in every parish church — built largely on Tyndale's work.\n\nThe phrases are his: let there be light, the salt of the earth, the powers that be, a law unto themselves. Roughly eighty per cent of the King James New Testament is his wording.",
    famousQuote:
      "If God spare my life, ere many years I will cause a boy that driveth the plough shall know more of the Scripture than thou dost.",
    bibleVerse: {
      text: "The grass withers, the flower fades, but the word of our God will stand forever.",
      reference: "Isaiah 40:8",
    },
    keyEvents: [
      { year: "1523", description: "Refused permission to translate the Bible in England; leaves for the Continent" },
      { year: "1526", description: "Prints the first English New Testament translated from Greek" },
      { year: "1530", description: "Publishes his translation of the Pentateuch" },
      { year: "1535", description: "Betrayed and arrested near Antwerp" },
      { year: "1536", description: "Strangled and burned at Vilvoorde" },
      { year: "1539", description: "England authorises an English Bible built largely on his work", dateNote: "The Great Bible, licensed three years after his death; his own Wikipedia article dates the reversal differently in places." },
    ],
    tags: ["bible translation", "martyr", "england", "greek", "hebrew", "smuggling", "king james"],
    sources: [
      { title: "William Tyndale: A Biography", author: "David Daniell", type: "book" },
      { title: "Tyndale's New Testament", author: "William Tyndale", type: "book" },
    ],
  },
  {
    id: "john-calvin",
    name: "John Calvin",
    group: "reformers",
    wikipedia: "John Calvin",
    timePeriod: "1509 - 1564",
    birthYear: "1509",
    deathYear: "1564",
    place: "Geneva, Switzerland",
    description:
      "A shy French scholar who wanted a quiet life of study and was bullied into leading a city instead.",
    contribution:
      "The Institutes of the Christian Religion, and a model of church life in Geneva that shaped Presbyterian and Reformed churches worldwide.",
    biography:
      "Calvin trained as a lawyer and wanted to be a humanist scholar. He fled France after a sudden conversion he barely described — he called it unexpected and left it at that — and published the first edition of his Institutes at twenty-six, intending it as a short handbook for ordinary believers. He kept expanding it for the rest of his life until it became the fullest systematic account of Protestant theology written in the century.\n\nHe intended to settle quietly in Strasbourg. A war closed the road and he detoured through Geneva, where the reformer Guillaume Farel heard he was in town, came to his lodging, and told him that God would curse his studies if he refused to help. Calvin, who found the whole encounter terrifying, stayed.\n\nGeneva expelled him three years later. He spent three happy years in Strasbourg pastoring French refugees and married Idelette de Bure, a widow; their only child died in infancy, and Calvin's brief written note about it is one of the few glimpses of him unguarded.\n\nGeneva asked him back. He returned in 1541 and spent the rest of his life preaching, lecturing, writing commentaries on nearly the whole Bible, and organising a church order with real independence from the city council — which is why he fought the council constantly.\n\nHis theology is often reduced to predestination, which he treated as a pastoral comfort rather than a puzzle: the point was that salvation rests on God's decision and not on the strength of yours.",
    complications:
      "In 1553 Michael Servetus, who denied the Trinity, was arrested in Geneva and burned at the stake. Calvin had argued he should die, though he asked for beheading rather than fire. He never repudiated it. Executing heretics was the near-universal practice of the age, Catholic and Protestant alike, but that is an explanation and not a defence.",
    famousQuote:
      "I offer my heart to you, Lord, promptly and sincerely.",
    bibleVerse: {
      text: "Trust in the LORD with all your heart, and do not lean on your own understanding.",
      reference: "Proverbs 3:5",
    },
    keyEvents: [
      { year: "1536", description: "Publishes the first edition of the Institutes at twenty-six" },
      { year: "1536", description: "Detained in Geneva by Farel and pressed into ministry" },
      { year: "1538", description: "Expelled from Geneva; pastors French refugees in Strasbourg" },
      { year: "1541", description: "Recalled to Geneva; stays for the rest of his life" },
      { year: "1553", description: "Michael Servetus burned in Geneva for denying the Trinity" },
      { year: "1559", description: "Founds the Geneva Academy and completes the final Institutes" },
    ],
    tags: ["reformation", "geneva", "institutes", "predestination", "france", "systematic theology"],
    sources: [
      { title: "Institutes of the Christian Religion", author: "John Calvin", type: "book" },
      { title: "Calvin", author: "Bruce Gordon", type: "book" },
    ],
  },
  {
    id: "john-knox",
    name: "John Knox",
    group: "reformers",
    wikipedia: "John Knox",
    timePeriod: "c. 1514 - 1572",
    birthYear: "c. 1514",
    deathYear: "1572",
    place: "Scotland",
    description:
      "A galley slave turned preacher who reformed Scotland and told a queen to her face that she was wrong.",
    contribution:
      "Led the Scottish Reformation and shaped Presbyterian church government — elders rather than bishops, and a church answerable to no crown.",
    biography:
      "Knox came late to prominence. He was a notary and tutor in his thirties when he attached himself to the reformer George Wishart, carrying a two-handed sword to guard him. Wishart was burned in 1546. Knox was captured the following year when the castle at St Andrews fell to French forces, and spent nineteen months chained to an oar in a French galley.\n\nReleased, he preached in England under Edward VI, then fled when Mary Tudor took the throne and burned Protestants. In exile he found his way to Geneva, which he called the most perfect school of Christ since the apostles, and absorbed Calvin's model of church order.\n\nHe returned to Scotland in 1559 and preached a sermon at Perth that set off a wave of iconoclasm. Within a year the Scottish Parliament had abolished papal authority and adopted a Reformed confession. Knox helped write the Scots Confession and the Book of Discipline, which proposed something remarkable for its time: a school in every parish and universal provision for the poor, funded from former church wealth. The nobles kept the wealth and the plan mostly failed.\n\nHis interviews with Mary, Queen of Scots are the most famous thing about him — a preacher lecturing a monarch on her Mass, and the queen in tears. He was unapologetic, and the encounter has been read as courage or as bullying ever since.",
    complications:
      "He published The First Blast of the Trumpet Against the Monstrous Regiment of Women, arguing that female rule was contrary to nature and to God. It was aimed at Mary Tudor, but it appeared just as the Protestant Elizabeth I took the English throne, and she never forgave him. It is indefensible on its own terms, and he never withdrew it.",
    famousQuote: "Give me Scotland, or I die.",
    bibleVerse: {
      text: "The fear of man lays a snare, but whoever trusts in the LORD is safe.",
      reference: "Proverbs 29:25",
    },
    keyEvents: [
      { year: "1546", description: "George Wishart, whom he guarded, is burned at St Andrews" },
      { year: "1547", description: "Captured and made a galley slave for nineteen months" },
      { year: "1549", description: "Released; preaches in England under Edward VI" },
      { year: "1559", description: "Returns to Scotland; his Perth sermon sparks the Reformation there" },
      { year: "1560", description: "Scottish Parliament adopts a Reformed confession; he helps write it" },
      { year: "1561-1563", description: "His confrontations with Mary, Queen of Scots" },
    ],
    tags: ["scotland", "presbyterian", "reformation", "galley slave", "preacher", "geneva", "education"],
    sources: [
      { title: "The History of the Reformation in Scotland", author: "John Knox", type: "book" },
      { title: "John Knox", author: "Jane Dawson", type: "book" },
    ],
  },
];
