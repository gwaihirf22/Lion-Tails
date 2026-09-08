import type { RawHero } from "./types";

/**
 * People in Scripture.
 *
 * A separate collection from the church-history heroes on purpose. What is
 * known about Moses comes from a text the reader treats as revelation; what is
 * known about Calvin comes from letters and council minutes. Those are not the
 * same kind of claim and one list would quietly suggest they were.
 *
 * Events are located by chapter and verse rather than by year. Dating Abraham
 * is an unsettled scholarly argument, and "c. 2000 BC" on a children's page
 * states as fact something that is not one. Every reference here is checked
 * against bible-api.com by scripts/verify-heroes.ts.
 *
 * Where a figure also has an entry in server/data/biblicalEvents.ts, that file
 * remains the source for STORY GENERATION and this one is the reading profile.
 * They are deliberately different jobs; the events file anchors a retelling,
 * this describes a person.
 */
export const bible: RawHero[] = [
  {
    id: "bible-abraham",
    name: "Abraham",
    collection: "biblical",
    group: "patriarchs",
    wikipedia: "Abraham",
    timePeriod: "Genesis 12-25",
    place: "Ur, Haran and Canaan",
    description:
      "Told to leave everything for a land he had never seen, on a promise he would not live to see kept.",
    contribution:
      "The father of Israel, and the pattern the New Testament uses for what faith actually is.",
    biography:
      "Abram was seventy-five and settled in Haran when God told him to leave his country, his people and his father's household for a land that would be shown to him. He went, taking Sarai his wife and Lot his nephew, without being told where he was going.\n\nThe promise had three parts: land, descendants, and blessing that would reach every family on earth. He received almost none of it in his lifetime. He owned no part of Canaan except a field he bought as a burial plot for Sarah, and he had one son by her, born when he was a hundred and she was ninety and had already laughed at the idea.\n\nHe is not presented as flawless. Twice he passed Sarah off as his sister to protect himself, putting her in danger both times. When the waiting became unbearable he took Hagar, Sarah's slave, at Sarah's suggestion, and the resulting family damage runs through the rest of Genesis.\n\nThe hardest chapter is the last test: God tells him to take Isaac, the son the whole promise depends on, to a mountain in Moriah. He goes. Isaac carries the wood and asks where the lamb is. Abraham's answer is that God will provide one, and at the last moment the angel of the LORD stops him and a ram is caught in a thicket.\n\nPaul returns to him again and again, because Genesis says Abram believed God and it was credited to him as righteousness — before the law, before circumcision, before anything he did.",
    famousQuote: "God will provide for himself the lamb for a burnt offering, my son.",
    bibleVerse: {
      text: "He believed in Yahweh, who credited it to him for righteousness.",
      reference: "Genesis 15:6",
    },
    keyEvents: [
      { reference: "Genesis 12:1-4", description: "Called at seventy-five to leave Haran for a land not yet shown to him" },
      { reference: "Genesis 15:5-6", description: "Told to count the stars; he believes God and it is credited as righteousness" },
      { reference: "Genesis 17:5", description: "Renamed from Abram to Abraham, father of a multitude" },
      { reference: "Genesis 18:23-33", description: "Argues with God over Sodom, down from fifty righteous men to ten" },
      { reference: "Genesis 21:1-7", description: "Isaac is born when Abraham is a hundred" },
      { reference: "Genesis 22:1-14", description: "Told to offer Isaac; stopped at the last moment, and a ram is provided" },
    ],
    tags: ["patriarch", "faith", "promise", "covenant", "isaac", "sarah", "genesis"],
    sources: [{ title: "Genesis", type: "book", description: "Chapters 12 through 25" }],
  },
  {
    id: "bible-joseph",
    name: "Joseph",
    collection: "biblical",
    group: "patriarchs",
    wikipedia: "Joseph (Genesis)",
    timePeriod: "Genesis 37-50",
    place: "Canaan and Egypt",
    description:
      "Sold into slavery by his own brothers, and the one who fed them twenty years later.",
    contribution:
      "The clearest statement in the Old Testament that God can mean for good what people meant for evil.",
    biography:
      "Joseph was the eleventh of twelve sons and his father's obvious favourite, which Jacob advertised with a richly ornamented coat. Joseph then told his brothers about two dreams in which they bowed to him. He was seventeen and not tactful.\n\nThey stripped off the coat and threw him into a dry cistern. Reuben meant to rescue him; Judah proposed selling him instead; traders took him to Egypt, and the brothers dipped the coat in goat's blood and let their father conclude the rest.\n\nIn Egypt he was bought by Potiphar and did well, then was falsely accused by Potiphar's wife and imprisoned. He did well there too, and interpreted the dreams of Pharaoh's cupbearer and baker — asking the cupbearer to remember him, and being forgotten for two full years.\n\nWhen Pharaoh dreamed of seven fat cows and seven thin, Joseph was brought from the cell. Seven years of plenty, then seven of famine. He was made second in Egypt at thirty.\n\nThe brothers came to buy grain and did not recognise him. What follows is not instant forgiveness: he tests them for chapters, plants a silver cup in Benjamin's sack, and only reveals himself when Judah offers to take Benjamin's place. Then he weeps loudly enough that the household hears.\n\nHis verdict on the whole thing, spoken to frightened brothers after their father died, is the line the story turns on.",
    famousQuote: "You meant evil against me, but God meant it for good.",
    bibleVerse: {
      text: "As for you, you meant evil against me, but God meant it for good, to save many people alive.",
      reference: "Genesis 50:20",
    },
    keyEvents: [
      { reference: "Genesis 37:3-4", description: "His father's favouritism and the ornamented coat set his brothers against him" },
      { reference: "Genesis 37:28", description: "Sold to traders and taken to Egypt" },
      { reference: "Genesis 39:19-20", description: "Falsely accused by Potiphar's wife and imprisoned" },
      { reference: "Genesis 40:23", description: "The cupbearer forgets him for two years" },
      { reference: "Genesis 41:41", description: "Made second in command over all Egypt" },
      { reference: "Genesis 45:1-4", description: "Reveals himself to his brothers and weeps" },
    ],
    tags: ["patriarch", "egypt", "slavery", "dreams", "forgiveness", "famine", "genesis"],
    sources: [{ title: "Genesis", type: "book", description: "Chapters 37 through 50" }],
  },
  {
    id: "bible-ruth",
    name: "Ruth",
    collection: "biblical",
    group: "judges-and-kings",
    wikipedia: "Ruth (biblical figure)",
    timePeriod: "The book of Ruth",
    place: "Moab and Bethlehem",
    description:
      "A foreign widow who refused to go home, gleaned in a stranger's field to feed her mother-in-law, and became King David's great-grandmother.",
    contribution:
      "One of two women with a book of the Bible named after her, and an ancestor of David and of Jesus.",
    biography:
      "Ruth was a Moabite — from a people Israel regarded with hostility — who married into an Israelite family that had come to Moab to escape famine. Within ten years her husband, his brother and their father were all dead, leaving three widows with no income and no protection.\n\nNaomi, her mother-in-law, decided to go home to Bethlehem and told both daughters-in-law to go back to their own mothers and remarry. Orpah did, sensibly. Ruth refused, and the speech she made is one of the most quoted in the Old Testament: where you go I will go, your people will be my people, your God my God.\n\nIn Bethlehem she went out to glean — following the harvesters and picking up what they dropped, which the law reserved for the poor and the foreigner. It was hard and it was not safe for a young woman alone.\n\nThe field belonged to Boaz, a relative of Naomi's late husband. He had heard what she had done for Naomi, told his men to leave extra grain and not to touch her, and eventually acted as her kinsman-redeemer, which meant marrying her and continuing her dead husband's line.\n\nThe book ends with a genealogy, which is the point of it: their son Obed fathered Jesse, who fathered David. A Moabite woman is in the line of Israel's king, and Matthew names her in the genealogy of Jesus.",
    famousQuote: "Where you go, I will go; and where you stay, I will stay.",
    bibleVerse: {
      text: "Where you go, I will go; and where you stay, I will stay. Your people shall be my people, and your God my God.",
      reference: "Ruth 1:16",
    },
    keyEvents: [
      { reference: "Ruth 1:5", description: "Widowed in Moab along with her sister-in-law and mother-in-law" },
      { reference: "Ruth 1:16-17", description: "Refuses to leave Naomi and pledges herself to Naomi's people and God" },
      { reference: "Ruth 2:2-3", description: "Gleans in the fields to feed them both" },
      { reference: "Ruth 3:9", description: "Asks Boaz to act as kinsman-redeemer" },
      { reference: "Ruth 4:13-17", description: "Marries Boaz; their son Obed becomes David's grandfather" },
    ],
    tags: ["moab", "widow", "loyalty", "gleaning", "boaz", "david", "genealogy", "women"],
    sources: [{ title: "Ruth", type: "book", description: "The whole book, four chapters" }],
  },
  {
    id: "bible-esther",
    name: "Esther",
    collection: "biblical",
    group: "exile",
    wikipedia: "Esther",
    timePeriod: "The book of Esther",
    place: "Susa, Persia",
    description:
      "A Jewish orphan who became queen of Persia and risked execution to stop the killing of her people.",
    contribution:
      "The book named after her is the only one in the Bible that never mentions God — and is entirely about his providence.",
    biography:
      "Esther was an orphan raised by her cousin Mordecai among the Jews who had stayed in Persia rather than return to Judah. When King Ahasuerus deposed Queen Vashti for refusing to be displayed to his guests, young women were gathered from across the empire, and Esther was taken into the palace. On Mordecai's advice she did not reveal that she was Jewish.\n\nHaman, the king's highest official, was enraged that Mordecai would not bow to him, and obtained a decree to destroy every Jew in the empire on a single day.\n\nMordecai sent word to Esther to intervene. Her first answer was fear, and it was reasonable: approaching the king uninvited was punishable by death, and he had not sent for her in thirty days. Mordecai's reply is the hinge of the book — that she should not imagine she would escape because she was in the palace, and that perhaps she had come to royal position for such a time as this.\n\nShe asked the Jews of Susa to fast for three days, said that if she perished she perished, and went in. The king received her. Over two banquets she exposed Haman, who was hanged on the gallows he had built for Mordecai.\n\nGod is never named in the book. Nobody prays aloud. Everything turns on coincidences stacked so high that the absence becomes the argument.",
    famousQuote: "If I perish, I perish.",
    bibleVerse: {
      text: "Who knows if you haven't come to the kingdom for such a time as this?",
      reference: "Esther 4:14",
    },
    keyEvents: [
      { reference: "Esther 2:7", description: "An orphan raised by her cousin Mordecai in Persia" },
      { reference: "Esther 2:17", description: "Made queen, concealing that she is Jewish" },
      { reference: "Esther 3:8-9", description: "Haman obtains a decree to destroy all the Jews" },
      { reference: "Esther 4:14", description: "Mordecai tells her she may have come to the kingdom for such a time as this" },
      { reference: "Esther 4:16", description: "Calls a three-day fast and resolves to approach the king uninvited" },
      { reference: "Esther 7:6", description: "Names Haman before the king at the second banquet" },
    ],
    tags: ["persia", "exile", "queen", "courage", "providence", "purim", "women", "orphan"],
    sources: [{ title: "Esther", type: "book", description: "The whole book, ten chapters" }],
  },
];
