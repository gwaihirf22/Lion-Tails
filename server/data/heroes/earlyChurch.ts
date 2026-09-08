import type { RawHero } from "./types";

/**
 * The Early Church: the apostolic fathers through the end of the patristic
 * age. Dates before about 200 are approximate and are written with "c." where
 * the sources genuinely disagree, rather than given false precision.
 */
export const earlyChurch: RawHero[] = [
  {
    id: "polycarp",
    name: "Polycarp of Smyrna",
    group: "early-church",
    timePeriod: "c. 69 - c. 155",
    birthYear: "c. 69",
    deathYear: "c. 155",
    place: "Smyrna, Asia Minor",
    description:
      "A bishop who had known the apostle John, and who chose to die rather than deny Christ.",
    contribution:
      "A living link between the apostles and the second-century church, and the author of the earliest Christian martyrdom account we possess outside the New Testament.",
    biography:
      "Polycarp was taught by the apostle John. That single fact is why the early church listened to him so carefully: when a dispute arose about what the apostles had actually taught, he was one of the few men alive who could say from memory. Irenaeus, who heard him preach as a boy, remembered him describing conversations with people who had seen Jesus.\n\nHe led the church at Smyrna for decades, wrote a letter to the Philippians that still survives, and travelled to Rome as an old man to argue — unsuccessfully but peaceably — about the date of Easter.\n\nHe was arrested during a local persecution when he was in his eighties. Friends hid him on a farm outside the city; when the soldiers came, he refused to run again, fed them a meal, and asked for an hour to pray. The proconsul, who plainly did not want to kill an old man, offered him an easy way out: swear by Caesar's fortune and curse Christ. Polycarp's answer was remembered word for word: \"Eighty-six years I have served him, and he has done me no wrong. How can I blaspheme my King who saved me?\"\n\nHe was burned in the stadium at Smyrna. The church there wrote down what happened and sent the account to another congregation, and that letter — the Martyrdom of Polycarp — became the model for how Christians told these stories afterwards: sober, specific, and refusing to make the martyr more than a man.",
    famousQuote:
      "Eighty-six years I have served him, and he has done me no wrong. How can I blaspheme my King who saved me?",
    bibleVerse: {
      text: "Be faithful unto death, and I will give you the crown of life.",
      reference: "Revelation 2:10",
    },
    keyEvents: [
      { year: "c. 69", description: "Born, probably in Asia Minor" },
      { year: "c. 110", description: "Receives a letter from Ignatius of Antioch on his way to martyrdom" },
      { year: "c. 110-140", description: "Writes his Letter to the Philippians" },
      { year: "c. 154", description: "Travels to Rome to discuss the date of Easter with Bishop Anicetus" },
      { year: "c. 155", description: "Arrested, refuses to deny Christ, and is burned at Smyrna" },
    ],
    tags: ["martyr", "bishop", "apostolic father", "persecution", "smyrna"],
    sources: [
      { title: "The Martyrdom of Polycarp", type: "book", description: "The eyewitness letter from the church at Smyrna" },
      { title: "The Apostolic Fathers", author: "Michael W. Holmes", type: "book" },
    ],
  },
  {
    id: "irenaeus",
    name: "Irenaeus of Lyons",
    group: "early-church",
    timePeriod: "c. 130 - c. 202",
    birthYear: "c. 130",
    deathYear: "c. 202",
    place: "Lyons, Gaul",
    description:
      "The first great theologian of the church after the apostles, who answered the Gnostics by pointing to what the churches had always taught.",
    contribution:
      "Argued that Christian truth is public and traceable, not secret — and in doing so shaped how the church came to recognise the New Testament.",
    biography:
      "Irenaeus grew up in Smyrna listening to Polycarp, then spent his working life at the other end of the empire, as a presbyter and later bishop in Lyons in Gaul. He arrived there as a missionary to a rough frontier city and stayed through a persecution that killed his predecessor.\n\nHis great opponents were the Gnostics, who taught that salvation came through secret knowledge handed down privately to a few, and that the God of the Old Testament was a lesser being than the Father of Jesus. Irenaeus wrote five books against them, usually called Against Heresies, and his method was as important as his conclusions. He did not claim a superior secret. He argued the opposite: that if the apostles had taught something, they taught it openly, in churches anyone could walk into, and those churches could still be asked what they had received.\n\nOut of that came two ideas the church has used ever since. The first is that Scripture has a shape — one God, one story, running from creation to Christ — so a reading that pits the Testaments against each other has already gone wrong. The second is his picture of Christ as the second Adam, living the human life the first Adam failed to live and gathering it up in himself.\n\nHe is also the earliest writer to treat four Gospels, and only four, as settled. When the church later drew up its list of New Testament books, it was largely confirming what Irenaeus described as already in use.",
    famousQuote: "The glory of God is a living man; and the life of man consists in beholding God.",
    bibleVerse: {
      text: "There is one body and one Spirit, just as you were called in one hope of your calling.",
      reference: "Ephesians 4:4",
    },
    keyEvents: [
      { year: "c. 130", description: "Born in Smyrna; hears Polycarp preach as a boy" },
      { year: "c. 177", description: "Becomes bishop of Lyons after a persecution kills Bishop Pothinus" },
      { year: "c. 180", description: "Writes Against Heresies" },
      { year: "c. 190", description: "Urges Rome not to break fellowship over the date of Easter" },
    ],
    tags: ["theologian", "bishop", "gnosticism", "canon", "gaul", "apologist"],
    sources: [
      { title: "Against Heresies", author: "Irenaeus", type: "book" },
      { title: "Irenaeus of Lyons", author: "Eric Osborn", type: "book" },
    ],
  },
  {
    id: "perpetua",
    name: "Perpetua",
    group: "early-church",
    timePeriod: "c. 182 - 203",
    birthYear: "c. 182",
    deathYear: "203",
    place: "Carthage, North Africa",
    description:
      "A young mother in Carthage who kept a diary in prison before she was killed in the arena, and whose own words survive.",
    contribution:
      "Her prison diary is the earliest surviving writing by a Christian woman, and one of the most personal documents to come out of the ancient church.",
    biography:
      "Vibia Perpetua was about twenty-two, well born, recently married, and nursing a baby son when she was arrested in Carthage with several others — among them Felicity, a pregnant slave woman, and the men preparing for baptism alongside her.\n\nWhat makes her account different from almost everything else from the period is that she wrote it herself, in prison, while it was happening. She describes the dark of the cell and the heat, the relief of being allowed to keep her baby with her, and her father coming again and again to beg her to say the words that would set her free. Those scenes are the heart of the diary: not a heroine facing down a tyrant, but a daughter refusing her father while loving him, and grieving that she cannot give him what he asks.\n\nHer answer to him is famous for its plainness. She pointed to a jug and asked whether it could be called by any other name than what it was. He said no. \"Neither can I call myself anything other than what I am, a Christian.\"\n\nShe records four visions, and then the diary stops. An eyewitness finished the account: Felicity gave birth in prison days before the end, and the two women went into the arena together on the emperor's birthday. Augustine preached on them two centuries later, and the North African church kept their day for as long as it existed.",
    famousQuote: "Neither can I call myself anything other than what I am, a Christian.",
    bibleVerse: {
      text: "Who shall separate us from the love of Christ?",
      reference: "Romans 8:35",
    },
    keyEvents: [
      { year: "203", description: "Arrested in Carthage with Felicity and others" },
      { year: "203", description: "Writes her prison diary, including four visions" },
      { year: "203", description: "Refuses her father's pleas to renounce Christ" },
      { year: "203", description: "Killed in the arena with Felicity" },
    ],
    tags: ["martyr", "woman", "carthage", "diary", "persecution", "north africa"],
    sources: [
      { title: "The Passion of Perpetua and Felicity", type: "book", description: "Contains her own prison diary" },
      { title: "Perpetua's Passion", author: "Joyce E. Salisbury", type: "book" },
    ],
  },
  {
    id: "athanasius",
    name: "Athanasius of Alexandria",
    group: "early-church",
    timePeriod: "c. 296 - 373",
    birthYear: "c. 296",
    deathYear: "373",
    place: "Alexandria, Egypt",
    description:
      "The bishop who spent his life insisting that Jesus is fully God, and was exiled five times for it.",
    contribution:
      "Held the line for Nicene orthodoxy through half a century when much of the empire's leadership had abandoned it.",
    biography:
      "Athanasius was a young deacon at the Council of Nicaea in 325, where the church confronted the teaching of Arius: that the Son was the highest of all creatures, but a creature nonetheless — that \"there was when he was not.\" Nicaea rejected it and said the Son was of the same substance as the Father.\n\nThat should have settled matters. It did not. Over the following decades, imperial favour swung back and forth, and for long stretches the Arian position held most of the important sees. Athanasius, bishop of Alexandria from 328, refused to sign the compromises. He was deposed and exiled five separate times under four emperors, spending roughly seventeen of his forty-five years as bishop away from his city — in Trier, in Rome, and for years hidden among the monks in the Egyptian desert.\n\nHis argument was never merely technical. In On the Incarnation, written while he was still young, he put it in terms anyone could follow: only God can save, and only a man can die; so if Christ is not both, we are not saved. The doctrine mattered because salvation depended on it.\n\nHe also wrote the Life of Antony, which introduced the wider church to the desert monks and shaped Christian devotion for centuries, and his Easter letter of 367 lists the twenty-seven books of the New Testament exactly as the church came to receive them — the earliest such list that survives.",
    famousQuote: "He became what we are that he might make us what he is.",
    bibleVerse: {
      text: "In the beginning was the Word, and the Word was with God, and the Word was God.",
      reference: "John 1:1",
    },
    keyEvents: [
      { year: "325", description: "Attends the Council of Nicaea as a young deacon" },
      { year: "328", description: "Becomes bishop of Alexandria" },
      { year: "335", description: "Exiled for the first time" },
      { year: "356-362", description: "Hides among the desert monks during his third exile" },
      { year: "367", description: "His Easter letter lists the 27 New Testament books" },
      { year: "373", description: "Dies in Alexandria, having outlasted the Arian ascendancy" },
    ],
    tags: ["theologian", "bishop", "nicaea", "arianism", "exile", "canon", "egypt"],
    sources: [
      { title: "On the Incarnation", author: "Athanasius", type: "book" },
      { title: "Athanasius: A Theological Introduction", author: "Thomas G. Weinandy", type: "book" },
    ],
  },
  {
    id: "john-chrysostom",
    name: "John Chrysostom",
    group: "early-church",
    timePeriod: "c. 347 - 407",
    birthYear: "c. 347",
    deathYear: "407",
    place: "Antioch and Constantinople",
    description:
      "The greatest preacher of the ancient church, whose plain sermons on Scripture emptied the theatres and eventually cost him everything.",
    contribution:
      "Modelled verse-by-verse preaching that explains the text and then applies it, and used the pulpit to confront wealth and power directly.",
    biography:
      "John was born in Antioch, trained as a rhetorician under the finest teacher of the age, and then abandoned the career it promised for the mountains outside the city, where he lived as a hermit for six years. He ruined his health there — he ate badly and slept less — and returned to Antioch to preach.\n\nHe preached through whole books of the Bible, verse by verse, in ordinary language, and crowds came in numbers that alarmed the authorities. The nickname Chrysostom, \"golden-mouthed\", was given to him long after his death, but it describes what people remembered: sermons that were both beautiful and unmistakably about them. He was relentless about money. He told a congregation of prosperous people that the poor at their gates were Christ, that ornamenting a church while ignoring a hungry man was an insult to the God being honoured, and that what they called their property was in fact held in trust.\n\nIn 397 he was taken — effectively against his will — to be archbishop of Constantinople. He reduced the household budget, sold off the furnishings, funded hospitals, and disciplined clergy. He also criticised the extravagance of the Empress Eudoxia, in a city where that was not survivable.\n\nHe was deposed, recalled after an earthquake frightened the court, and deposed again. He died on a forced march into exile on the Black Sea, worn out. His last recorded words were \"Glory to God for all things.\"",
    complications:
      "A series of his Antioch sermons attacks Judaizing Christians in language that is genuinely vicious about Jews, and it was quoted approvingly by antisemites for centuries afterwards. Reading him honestly means reading that too.",
    famousQuote: "Glory to God for all things.",
    bibleVerse: {
      text: "Whoever wants to become great among you shall be your servant.",
      reference: "Matthew 20:26",
    },
    keyEvents: [
      { year: "c. 373", description: "Withdraws to the mountains outside Antioch as a hermit" },
      { year: "386", description: "Ordained a presbyter at Antioch; begins his great preaching years" },
      { year: "397", description: "Made archbishop of Constantinople against his wishes" },
      { year: "403", description: "Deposed by the Synod of the Oak; recalled days later" },
      { year: "404", description: "Exiled a second time" },
      { year: "407", description: "Dies on the road into further exile" },
    ],
    tags: ["preacher", "bishop", "constantinople", "antioch", "poverty", "exile"],
    sources: [
      { title: "Homilies on the Gospel of Matthew", author: "John Chrysostom", type: "book" },
      { title: "John Chrysostom", author: "J. N. D. Kelly", type: "book", description: "Golden Mouth: The Story of John Chrysostom" },
    ],
  },
  {
    id: "augustine",
    name: "Augustine of Hippo",
    group: "early-church",
    timePeriod: "354 - 430",
    birthYear: "354",
    deathYear: "430",
    place: "Hippo Regius, North Africa",
    description:
      "A restless, brilliant young man who chased every other answer before Christ caught him — and then shaped Western theology for a thousand years.",
    contribution:
      "Wrote the Confessions and the City of God, and framed the questions about grace, sin and the will that the Reformation would later reopen.",
    biography:
      "Augustine was born in a small North African town to a pagan father and a Christian mother, Monica, whose prayers he later said followed him everywhere he went. He was clever, ambitious, and by his own account thoroughly self-absorbed. He took a mistress, fathered a son, taught rhetoric in Carthage and then Rome, and spent nine years as a Manichaean, persuaded by a system that explained evil by making it a substance.\n\nHe found his way out slowly: through the preaching of Ambrose in Milan, through Neoplatonist philosophy that gave him a way to think about God as not-material, and finally in a garden in 386, where he heard a child's voice chanting \"take up and read\", opened Paul's letter to the Romans, and stopped arguing.\n\nHe was baptised at Easter, returned to Africa, and was made bishop of Hippo more or less by public acclamation — a role he had not wanted and never left. He preached constantly, adjudicated local disputes, and wrote.\n\nThe Confessions is the first real autobiography in Western literature, and it is addressed to God rather than to a reader. The City of God was written after Rome fell in 410, to answer people who blamed the disaster on Christianity, and it argues that two loves build two cities and that no earthly empire is the kingdom of God. Against Pelagius he insisted that the will itself is damaged and that grace must come first. He died with the Vandals besieging his city.",
    complications:
      "Late in the Donatist controversy he came to accept state coercion of schismatics, and his arguments were used to justify religious persecution for centuries. He came to regret much else in his old age and wrote a whole book, the Retractations, correcting himself.",
    famousQuote:
      "You have made us for yourself, and our heart is restless until it rests in you.",
    bibleVerse: {
      text: "Not in reveling and drunkenness, not in sexual promiscuity and lustful acts... but put on the Lord Jesus Christ.",
      reference: "Romans 13:13-14",
    },
    keyEvents: [
      { year: "354", description: "Born at Thagaste in North Africa" },
      { year: "373", description: "Becomes a Manichaean after reading Cicero" },
      { year: "384", description: "Moves to Milan; hears Ambrose preach" },
      { year: "386", description: "Converted in a garden after reading Romans 13" },
      { year: "391", description: "Ordained at Hippo; made bishop four years later" },
      { year: "397-400", description: "Writes the Confessions" },
      { year: "413-426", description: "Writes the City of God after the sack of Rome" },
      { year: "430", description: "Dies as the Vandals besiege Hippo" },
    ],
    tags: ["theologian", "bishop", "conversion", "grace", "north africa", "confessions", "philosophy"],
    sources: [
      { title: "Confessions", author: "Augustine", type: "book" },
      { title: "The City of God", author: "Augustine", type: "book" },
      { title: "Augustine of Hippo: A Biography", author: "Peter Brown", type: "book" },
    ],
  },
  {
    id: "patrick",
    name: "Patrick of Ireland",
    group: "early-church",
    timePeriod: "c. 385 - c. 461",
    birthYear: "c. 385",
    deathYear: "c. 461",
    place: "Britain and Ireland",
    description:
      "Kidnapped as a boy and enslaved in Ireland, he escaped — and then went back to the people who had taken him.",
    contribution:
      "Brought the gospel to Ireland as a former slave returning to his captors, and left two short writings in his own voice.",
    biography:
      "Almost everything reliably known about Patrick comes from two documents he wrote himself: a short autobiography called the Confession, and a furious open letter to a British warlord named Coroticus whose soldiers had killed and enslaved Irish Christians.\n\nHe was born in Roman Britain to a deacon's family, and by his own admission was not a believer as a boy. At about sixteen he was seized by raiders and sold into slavery in Ireland, where he spent six years herding animals in the open. He says the isolation and the cold drove him to prayer — a hundred prayers a day, and as many at night. Then a voice in a dream told him a ship was ready. He walked two hundred miles to the coast, talked his way aboard, and eventually reached home.\n\nHis family understandably begged him never to leave again. But he dreamed of a man carrying letters from Ireland, headed \"The Voice of the Irish\", and heard them calling him to come back and walk among them once more.\n\nHe returned as a bishop and spent the rest of his life there, baptising, ordaining clergy, and negotiating constantly with local kings for the safety of his converts. He was acutely conscious of his poor Latin and said so repeatedly — his Confession opens by calling himself a sinner and a country bumpkin.\n\nThe snakes and the shamrock are much later legends. What he actually left is rarer: the voice of a man who forgave the people who enslaved him and gave them his life.",
    famousQuote: "I am Patrick, a sinner, most unlearned, the least of all the faithful.",
    bibleVerse: {
      text: "Go therefore and make disciples of all nations.",
      reference: "Matthew 28:19",
    },
    keyEvents: [
      { year: "c. 401", description: "Captured by raiders at about sixteen and enslaved in Ireland" },
      { year: "c. 407", description: "Escapes after six years and returns to Britain" },
      { year: "c. 432", description: "Returns to Ireland as a bishop" },
      { year: "c. 450", description: "Writes his Letter to Coroticus condemning the slave trade" },
      { year: "c. 460", description: "Writes the Confession" },
    ],
    tags: ["missionary", "ireland", "slavery", "bishop", "britain", "forgiveness"],
    sources: [
      { title: "The Confession of Saint Patrick", author: "Patrick", type: "book" },
      { title: "Letter to the Soldiers of Coroticus", author: "Patrick", type: "book" },
      { title: "Saint Patrick of Ireland: A Biography", author: "Philip Freeman", type: "book" },
    ],
  },
];
