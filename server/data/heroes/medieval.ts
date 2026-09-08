import type { RawHero } from "./types";

/**
 * The Middle Ages. These are the figures a classical curriculum assigns and a
 * Protestant reading list often skips, which is why several of them carry a
 * note about where their own tradition and a Reformed reader part company.
 */
export const medieval: RawHero[] = [
  {
    id: "anselm",
    name: "Anselm of Canterbury",
    group: "medieval",
    wikipedia: "Anselm of Canterbury",
    timePeriod: "1033 - 1109",
    birthYear: "1033",
    deathYear: "1109",
    place: "Bec, Normandy and Canterbury",
    description:
      "A monk who tried to prove God exists using nothing but reason, and who asked why the cross was necessary at all.",
    contribution:
      "The ontological argument, and Cur Deus Homo — the first sustained attempt to explain why salvation required God to become man and die.",
    biography:
      "Anselm left Italy as a young man, walked north, and settled at the abbey of Bec in Normandy because a teacher there interested him. He became prior and then abbot, and by all accounts was an unusually gentle superior in an age when that was not expected.\n\nHe described theology as faith seeking understanding: not believing because you have proved something, but believing first and then wanting to see how it hangs together. His Proslogion contains the argument he is famous for — that God is that than which nothing greater can be conceived, and that such a being must exist in reality and not merely in the mind, since existing is greater than not existing. Philosophers have been arguing about it for nine hundred years, which is roughly the reception he hoped for.\n\nHis more consequential book is Cur Deus Homo, \"Why God Became Man.\" He set out to answer, without appealing to Scripture as a premise, why God could not simply forgive. His answer was that sin is not a private debt but an offence against the order of things, that satisfaction must be made by a man because man owes it, and can be made only by God because the debt is infinite — therefore the God-man. Later theologians reworked it heavily, but the shape of Western thinking about the atonement starts here.\n\nHe was made Archbishop of Canterbury against his will and spent much of the role in conflict with two English kings over whether the crown could appoint bishops. He was exiled twice and did not give way.",
    famousQuote:
      "I do not seek to understand in order that I may believe, but I believe in order that I may understand.",
    bibleVerse: {
      text: "Unless you believe, you will not understand.",
      reference: "Isaiah 7:9",
    },
    keyEvents: [
      {
        year: "1060",
        description: "Becomes a monk at Bec in Normandy",
        dateNote: "He entered Bec at twenty-seven, which is the standard dating; his Wikipedia article does not give the year.",
      },
      { year: "1078", description: "Elected abbot of Bec" },
      { year: "1093", description: "Made Archbishop of Canterbury, reluctantly" },
      { year: "1098", description: "Completes Cur Deus Homo while in exile" },
      { year: "1097-1100", description: "First exile, in a dispute with William II over church appointments" },
    ],
    tags: ["theologian", "philosophy", "atonement", "canterbury", "monk", "normandy", "reason"],
    sources: [
      { title: "Proslogion", author: "Anselm", type: "book" },
      { title: "Cur Deus Homo (Why God Became Man)", author: "Anselm", type: "book" },
    ],
  },
  {
    id: "bernard-of-clairvaux",
    name: "Bernard of Clairvaux",
    group: "medieval",
    wikipedia: "Bernard of Clairvaux",
    timePeriod: "1090 - 1153",
    birthYear: "1090",
    deathYear: "1153",
    place: "Clairvaux, France",
    description:
      "The most persuasive man in twelfth-century Europe, who wrote about the love of God and also preached a crusade.",
    contribution:
      "Reformed monasticism, wrote sermons on the Song of Songs that Luther and Calvin both admired, and left hymns still sung today.",
    biography:
      "Bernard entered the struggling new monastery at Cîteaux at twenty-two and brought about thirty relatives and friends with him, which tells you most of what you need to know about his powers of persuasion. Three years later he was sent to found a house at Clairvaux, and by his death the Cistercian order had spread across Europe.\n\nHis writing is warmer than almost anything else from the period. His sermons on the Song of Songs — eighty-six of them, and he never got past the second chapter — are about the soul's love for God pursued with an intensity that later Protestants found surprisingly congenial. Luther called him the best of the medieval writers. Calvin quoted him approvingly, which Calvin did not do lightly.\n\nHe was also, unavoidably, a political operator. He arbitrated a papal schism, hunted down the theologian Peter Abelard and had him condemned, and advised popes who had been his own monks.\n\nAnd in 1146 he preached the Second Crusade at the request of the pope, drawing enormous crowds and enormous enlistment. The crusade was a catastrophe. Bernard took the blame publicly and wrote that he was reproached from every side, saying the responsibility was his and that he had believed himself sent by God.",
    complications:
      "Preaching the Second Crusade is not a footnote to his life; tens of thousands died and it hardened the pattern of holy war for centuries. He did also intervene to stop massacres of Jews in the Rhineland that were being carried out in the crusade's name, which is worth knowing alongside it, not instead of it.",
    famousQuote: "We find rest in those we love, and we provide a resting place in ourselves for those who love us.",
    bibleVerse: {
      text: "I am my beloved's, and my beloved is mine.",
      reference: "Song of Songs 6:3",
    },
    keyEvents: [
      { year: "1113", description: "Enters the monastery at Cîteaux with about thirty companions" },
      { year: "1115", description: "Founds the abbey of Clairvaux at twenty-five" },
      { year: "1135", description: "Begins his sermons on the Song of Songs" },
      { year: "1146", description: "Preaches the Second Crusade" },
      { year: "1148", description: "The crusade collapses; he accepts public blame" },
    ],
    tags: ["monk", "cistercian", "crusade", "song of songs", "france", "mysticism", "hymns"],
    sources: [
      { title: "On Loving God", author: "Bernard of Clairvaux", type: "book" },
      { title: "Sermons on the Song of Songs", author: "Bernard of Clairvaux", type: "book" },
    ],
  },
  {
    id: "thomas-aquinas",
    name: "Thomas Aquinas",
    group: "medieval",
    wikipedia: "Thomas Aquinas",
    timePeriod: "1225 - 1274",
    birthYear: "1225",
    deathYear: "1274",
    place: "Naples and Paris",
    description:
      "A nobleman's son whose family locked him in a tower to stop him becoming a friar, and who went on to write the most ambitious theology book ever attempted.",
    contribution:
      "The Summa Theologiae, and the argument that reason and revelation cannot finally contradict each other because both come from God.",
    biography:
      "Aquinas's family intended him for a comfortable abbacy. When he joined the Dominicans — a new order of preachers who begged for their food — his brothers kidnapped him and held him at the family castle for about a year. He spent it reading. He did not change his mind, and eventually they let him go.\n\nHe was large, silent, and so unforthcoming in class that fellow students called him the dumb ox. His teacher Albert the Great is said to have replied that the bellowing of this ox would be heard through the whole world.\n\nHis project was to take Aristotle — newly recovered in the West through Arabic and Jewish scholars, and regarded by many churchmen as dangerous — and show that rigorous philosophy and Christian faith belong together. Grace does not destroy nature but perfects it, he argued; if something is true, it cannot conflict with what God has revealed, because God is the author of both.\n\nThe Summa Theologiae is structured as thousands of questions, each stating the strongest objections first and answering them afterwards. It is a model of arguing fairly with people you disagree with.\n\nHe never finished it. In December 1273, after a long experience during Mass that he would not describe, he stopped writing. Pressed by his secretary, he said only that everything he had written seemed like straw compared with what he had seen. He died a few months later, not yet fifty.",
    complications:
      "He is the central theologian of Roman Catholicism, and Protestants disagree with him on real things — the nature of the Mass, merit, and the place of tradition among them. Reformed readers have nevertheless drawn on him heavily on God, creation and natural law, and pretending he does not exist is how a classical education ends up with a hole in the middle of it.",
    famousQuote: "All that I have written seems like straw to me compared to what I have seen.",
    bibleVerse: {
      text: "Oh, the depth of the riches and wisdom and knowledge of God!",
      reference: "Romans 11:33",
    },
    keyEvents: [
      { year: "1244", description: "Joins the Dominicans; his family imprisons him for about a year" },
      { year: "1252", description: "Sent to study in Paris under Albert the Great" },
      { year: "1265", description: "Begins the Summa Theologiae" },
      { year: "1273", description: "Stops writing after an experience during Mass" },
      { year: "1274", description: "Dies on the way to the Council of Lyon" },
    ],
    tags: ["theologian", "philosophy", "aristotle", "dominican", "summa", "reason", "natural law"],
    sources: [
      { title: "Summa Theologiae", author: "Thomas Aquinas", type: "book" },
      { title: "Aquinas: A Beginner's Guide", author: "Edward Feser", type: "book" },
    ],
  },
  {
    id: "john-wycliffe",
    name: "John Wycliffe",
    group: "medieval",
    wikipedia: "John Wycliffe",
    timePeriod: "c. 1328 - 1384",
    birthYear: "c. 1328",
    deathYear: "1384",
    place: "Oxford and Lutterworth, England",
    description:
      "An Oxford scholar who said the Bible belonged to everyone in their own language, a century and a half before Tyndale.",
    contribution:
      "Drove the first complete English Bible and argued that Scripture, not the church hierarchy, is the final authority.",
    biography:
      "Wycliffe was among the leading philosophers at Oxford before he became a controversialist. His conclusions arrived in an order that alarmed the authorities: that the church's wealth was indefensible, that a priest in mortal sin held no real authority, that the pope's claims had no basis in Scripture, and — most dangerously — that transubstantiation was philosophically incoherent.\n\nUnderlying all of it was one conviction: Scripture is the highest authority, so every Christian needs access to it. In the 1380s he and his associates produced the first complete Bible in English, translated from the Latin Vulgate. Copies were made by hand and passed around at real risk; owning one in English later became evidence of heresy.\n\nHis followers were nicknamed Lollards, roughly \"mumblers\", and they were preachers rather than scholars, sent out to read the Bible aloud to people who could not read it themselves.\n\nHe was protected by powerful patrons and by the fact that the papacy was in schism and busy. He was condemned but never burned, and died of a stroke at his parish in Lutterworth.\n\nThe Council of Constance settled his case in 1415, more than thirty years after his death, by declaring him a heretic and ordering his bones dug up and burned and the ashes thrown into the river Swift. The historian Thomas Fuller later observed that the brook carried them to the Avon, the Avon to the Severn, and the Severn to the sea.",
    famousQuote: "The Bible is for the government of the people, by the people, and for the people.",
    bibleVerse: {
      text: "Your word is a lamp to my feet and a light to my path.",
      reference: "Psalm 119:105",
    },
    keyEvents: [
      { year: "1374", description: "Becomes rector of Lutterworth" },
      { year: "1377", description: "Condemned in a papal bull; protected by his patrons" },
      { year: "1382", description: "The first complete English Bible is produced by him and his circle" },
      { year: "1384", description: "Dies at Lutterworth after a stroke" },
      { year: "1415", description: "Declared a heretic at Constance; his remains are later exhumed and burned" },
    ],
    tags: ["bible translation", "england", "oxford", "lollards", "reform", "authority", "heresy"],
    sources: [
      { title: "John Wycliffe: Myth and Reality", author: "G. R. Evans", type: "book" },
      { title: "On the Truth of Holy Scripture", author: "John Wycliffe", type: "book" },
    ],
  },
  {
    id: "jan-hus",
    name: "Jan Hus",
    group: "medieval",
    wikipedia: "Jan Hus",
    timePeriod: "c. 1369 - 1415",
    birthYear: "c. 1369",
    deathYear: "1415",
    place: "Prague, Bohemia",
    description:
      "A Czech preacher burned at a council he attended under a promise of safe conduct — a century before Luther said much the same things.",
    contribution:
      "Preached in the language of his people, insisted Scripture outranks a pope, and became the reason Luther knew what he was risking.",
    biography:
      "Hus was rector of the University of Prague and preacher at the Bethlehem Chapel, a building put up specifically for preaching in Czech rather than Latin. He read Wycliffe, agreed with a good deal of him, and said so from a pulpit that held three thousand people.\n\nHis targets were the sale of indulgences, clerical corruption, and the claim that the church's authority stood above Scripture. He also pressed for the cup at communion to be given to ordinary people and not reserved to priests — a small-sounding matter that became the emblem of the whole movement in Bohemia.\n\nIn 1414 he was summoned to the Council of Constance to defend himself, and travelled there under a written guarantee of safe conduct from the Holy Roman Emperor Sigismund. He was arrested anyway, held for months in poor conditions, and given a hearing in which he was told to recant a list of statements — some of which he denied ever making. He said he would recant anything shown to be contrary to Scripture. That was refused as an answer.\n\nHe was burned on 6 July 1415. Sigismund's broken promise was remembered for centuries and made later reformers deeply reluctant to trust similar guarantees.\n\nA hundred and four years later, at the Leipzig debate, Luther's opponent accused him of being a Hussite. Luther went away, read Hus, and concluded that he had been one without knowing it.",
    famousQuote:
      "Seek the truth, listen to the truth, teach the truth, love the truth, abide by the truth, and defend the truth unto death.",
    bibleVerse: {
      text: "You will know the truth, and the truth will set you free.",
      reference: "John 8:32",
    },
    keyEvents: [
      { year: "1402", description: "Becomes preacher at the Bethlehem Chapel in Prague" },
      { year: "1409", description: "Made rector of the University of Prague" },
      { year: "1412", description: "Condemns the sale of indulgences and is excommunicated" },
      { year: "1414", description: "Travels to the Council of Constance under imperial safe conduct" },
      { year: "1415", description: "Burned at the stake on 6 July" },
    ],
    tags: ["martyr", "bohemia", "prague", "preacher", "reform", "indulgences", "wycliffe"],
    sources: [
      { title: "The Letters of John Hus", author: "Jan Hus", type: "book" },
      { title: "Jan Hus: Religious Reform and Social Revolution in Bohemia", author: "Thomas A. Fudge", type: "book" },
    ],
  },
];
