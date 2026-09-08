import type { RawHero } from "./types";

/**
 * The modern era. Several of these are recent enough that the arguments about
 * them are still live, which the complications field reflects.
 */
export const modern: RawHero[] = [
  {
    id: "william-wilberforce",
    name: "William Wilberforce",
    group: "modern",
    wikipedia: "William Wilberforce",
    timePeriod: "1759 - 1833",
    birthYear: "1759",
    deathYear: "1833",
    place: "England",
    description:
      "A rich, witty young MP who could have had any career he wanted, and spent forty-six years on one bill instead.",
    contribution:
      "Led the parliamentary campaign that abolished the British slave trade in 1807 and slavery itself in 1833.",
    biography:
      "Wilberforce entered Parliament at twenty-one on his own money and was, by every account, extraordinarily good company — a fine singer, a devastating mimic, and close friends with the future prime minister William Pitt.\n\nHis conversion in his mid-twenties nearly ended his political career, because he assumed a serious Christian could not remain in public life. John Newton, the former slave ship captain turned clergyman, told him to stay. He later wrote that God had set before him two great objects: the suppression of the slave trade, and the reformation of manners.\n\nHe brought his first abolition bill in 1791. It was defeated. He brought it again, and again, and again — eleven times over sixteen years, against organised opposition from the West India interest, wartime arguments that abolition would help the French, and his own poor health, which was wretched for most of his adult life.\n\nHe did not do it alone, and the campaign is a study in how such things are actually won. Thomas Clarkson gathered the evidence, riding thousands of miles to interview sailors. Olaudah Equiano, who had been enslaved himself, wrote the bestselling account that made it real to readers. Hannah More wrote for popular audiences. Josiah Wedgwood made the medallion. Ordinary people boycotted sugar.\n\nThe trade was abolished in 1807. Slavery itself in the British Empire went in 1833. Wilberforce was told the bill would pass three days before he died.",
    complications:
      "He opposed trade unions and supported the suspension of habeas corpus, and his \"reformation of manners\" society prosecuted the poor for offences the rich committed unpunished. He was a reformer on one enormous question and a conservative on most others.",
    famousQuote:
      "You may choose to look the other way, but you can never again say you did not know.",
    bibleVerse: {
      text: "Learn to do right; seek justice. Defend the oppressed.",
      reference: "Isaiah 1:17",
    },
    keyEvents: [
      { year: "1780", description: "Elected to Parliament at twenty-one" },
      { year: "1785", description: "Converted; considers leaving politics and is urged by John Newton to stay" },
      { year: "1791", description: "His first abolition bill is defeated" },
      { year: "1807", description: "The slave trade is abolished after sixteen years of attempts" },
      { year: "1833", description: "Slavery abolished in the British Empire days before his death" },
    ],
    tags: ["abolition", "slavery", "parliament", "england", "politics", "clapham", "reform"],
    sources: [
      { title: "Amazing Grace: William Wilberforce and the Heroic Campaign to End Slavery", author: "Eric Metaxas", type: "book" },
      { title: "A Practical View of Christianity", author: "William Wilberforce", type: "book" },
    ],
  },
  {
    id: "dietrich-bonhoeffer",
    name: "Dietrich Bonhoeffer",
    group: "modern",
    wikipedia: "Dietrich Bonhoeffer",
    timePeriod: "1906 - 1945",
    birthYear: "1906",
    deathYear: "1945",
    place: "Germany",
    description:
      "A pacifist theologian who joined a plot to kill Hitler, and was hanged for it three weeks before the camp was liberated.",
    contribution:
      "The Cost of Discipleship, Life Together, and the Letters and Papers from Prison — plus the Confessing Church's resistance to a Nazified Christianity.",
    biography:
      "Bonhoeffer came from a distinguished, sceptical Berlin family and announced at thirteen that he would study theology, to their bemusement. He had a doctorate at twenty-one.\n\nA year in New York changed him. He found the liberal theology at Union Seminary thin, and found something else entirely at Abyssinian Baptist Church in Harlem, where he taught Sunday school and heard preaching that connected the gospel to the actual suffering of actual people. He went home to a Germany where Hitler took power within months.\n\nHe was among the earliest to see it clearly. Two days after Hitler became Chancellor, Bonhoeffer gave a radio address on the danger of a leader who becomes an idol; the broadcast was cut off. He opposed the Aryan Paragraph excluding Jewish Christians from the ministry, helped found the Confessing Church, and ran an illegal seminary at Finkenwalde until the Gestapo closed it.\n\nHe was in America in 1939, safe, and turned round after a few weeks — writing that he had no right to take part in rebuilding Germany afterwards if he did not share its trials now.\n\nHe joined the Abwehr, the military intelligence office that concealed the conspiracy against Hitler, and used his ecumenical contacts to pass messages and help Jews escape to Switzerland. A pacifist by conviction, he concluded that a Christian must sometimes act and accept the guilt of it. He was arrested in 1943, held for two years, and hanged at Flossenbürg on 9 April 1945.",
    famousQuote:
      "When Christ calls a man, he bids him come and die.",
    bibleVerse: {
      text: "Open your mouth for the mute, for the rights of all who are destitute.",
      reference: "Proverbs 31:8",
    },
    keyEvents: [
      { year: "1930", description: "Studies in New York; worships at Abyssinian Baptist Church in Harlem" },
      { year: "1933", description: "Radio address warning against a leader who becomes an idol is cut off" },
      { year: "1935", description: "Leads the illegal seminary at Finkenwalde" },
      { year: "1939", description: "Returns to Germany from safety in America after a few weeks" },
      { year: "1943", description: "Arrested and imprisoned" },
      { year: "1945", description: "Hanged at Flossenbürg on 9 April, weeks before liberation" },
    ],
    tags: ["nazi germany", "resistance", "martyr", "confessing church", "prison", "discipleship", "theologian"],
    sources: [
      { title: "The Cost of Discipleship", author: "Dietrich Bonhoeffer", type: "book" },
      { title: "Letters and Papers from Prison", author: "Dietrich Bonhoeffer", type: "book" },
    ],
  },
  {
    id: "corrie-ten-boom",
    name: "Corrie ten Boom",
    group: "modern",
    wikipedia: "Corrie ten Boom",
    timePeriod: "1892 - 1983",
    birthYear: "1892",
    deathYear: "1983",
    place: "Haarlem, Netherlands",
    description:
      "A Dutch watchmaker who hid Jews behind a false wall in her bedroom, survived Ravensbrück, and spent the rest of her life talking about forgiveness.",
    contribution:
      "The Hiding Place, and a lifetime of speaking on forgiveness to people who had every reason to refuse it.",
    biography:
      "The ten Booms were watchmakers in Haarlem for over a century, living above the shop. Corrie was the first licensed woman watchmaker in the Netherlands, unmarried, and in her late forties when Germany invaded.\n\nThe family's involvement in the resistance began without much deliberation — a Jewish woman knocked, and Corrie's father Casper said that in this house God's people were welcome. They built a false wall in Corrie's bedroom with a crawl space behind it, obtained ration cards through the underground, and moved people onward. An estimated eight hundred lives passed through.\n\nAn informer betrayed them in February 1944. The Gestapo searched and found nothing — six people were behind the wall and stayed there for nearly three days before the resistance got them out — but arrested the family anyway. Casper, aged eighty-four, died in a prison hospital within ten days.\n\nCorrie and her sister Betsie were sent to Ravensbrück. Betsie died there in December 1944. Corrie was released days later through what she was told was a clerical error; the women of her age group were killed the following week.\n\nShe spent the next thirty-three years travelling and speaking, into her eighties. The story she returned to was of meeting, at a church in Munich in 1947, one of the guards from Ravensbrück, who put out his hand and asked her forgiveness. She wrote that she could not do it, prayed for help, and found her hand going out.",
    famousQuote:
      "Forgiveness is an act of the will, and the will can function regardless of the temperature of the heart.",
    bibleVerse: {
      text: "If you forgive others their trespasses, your heavenly Father will also forgive you.",
      reference: "Matthew 6:14",
    },
    keyEvents: [
      { year: "1922", description: "Becomes the first licensed woman watchmaker in the Netherlands" },
      { year: "1942", description: "The family begins hiding Jews above the watch shop" },
      { year: "1944", description: "Betrayed and arrested; her father dies in prison within ten days" },
      { year: "1944", description: "Betsie dies at Ravensbrück in December" },
      { year: "1944", description: "Released days later through a clerical error" },
      {
        year: "1947",
        description: "Meets a former Ravensbrück guard in Munich who asks her forgiveness",
        dateNote: "From her own account in The Hiding Place; her Wikipedia article does not date the encounter.",
      },
    ],
    tags: ["holocaust", "netherlands", "resistance", "ravensbruck", "forgiveness", "hiding place", "watchmaker"],
    sources: [
      { title: "The Hiding Place", author: "Corrie ten Boom", type: "book" },
    ],
  },
  {
    id: "c-s-lewis",
    name: "C. S. Lewis",
    group: "modern",
    wikipedia: "C. S. Lewis",
    timePeriod: "1898 - 1963",
    birthYear: "1898",
    deathYear: "1963",
    place: "Oxford and Cambridge, England",
    description:
      "An atheist Oxford don argued into Christianity by his friends, who then explained it to more people than any preacher of his century.",
    contribution:
      "Mere Christianity, the Narnia books, and a body of writing that makes the faith intelligible without making it smaller.",
    biography:
      "Lewis lost his mother at nine and his faith not long after. He fought in the trenches at nineteen, was wounded, and returned to Oxford to become a tutor in English literature — clever, combative, and settled in his atheism.\n\nHis friends dismantled it. J. R. R. Tolkien and Hugo Dyson walked with him along Addison's Walk one night in 1931 arguing that the myths Lewis loved were not lies but glimpses, and that in Christ one had actually happened. He described his conversion, characteristically, without a shred of triumph: brought in kicking and struggling, the most dejected and reluctant convert in all England.\n\nDuring the war the BBC asked him to give radio talks on Christianity. They were plain, unsentimental and enormously popular; collected, they became Mere Christianity, which deliberately argues only for what nearly all Christians hold in common.\n\nHe wrote The Screwtape Letters as advice from one devil to another, and the Narnia books for children — which he insisted were not allegory but a supposal: what might the Son of God be like in a world of talking animals.\n\nHe married Joy Davidman late, knowing she was dying of cancer, and she died four years later. A Grief Observed came out of that, published under a pseudonym because it is too raw and too angry to be reassuring, and it is the least tidy thing he wrote.",
    complications:
      "His arguments are sometimes accused of being neater than the questions deserve. Lewis was not writing systematic theology and said so; readers who take Mere Christianity as one are asking it for something it does not offer.",
    famousQuote:
      "I believe in Christianity as I believe that the sun has risen: not only because I see it, but because by it I see everything else.",
    bibleVerse: {
      text: "You will seek me and find me, when you seek me with all your heart.",
      reference: "Jeremiah 29:13",
    },
    keyEvents: [
      { year: "1917", description: "Wounded fighting in the trenches at nineteen" },
      { year: "1931", description: "Converted after a night walk with Tolkien and Dyson" },
      { year: "1941", description: "Begins the BBC broadcasts that became Mere Christianity" },
      { year: "1942", description: "Publishes The Screwtape Letters" },
      {
        year: "1950",
        description: "Publishes The Lion, the Witch and the Wardrobe",
        dateNote: "The book's own publication date; his biography article does not list it.",
      },
      { year: "1960", description: "Joy Davidman dies; he writes A Grief Observed" },
    ],
    tags: ["oxford", "narnia", "apologetics", "atheism", "tolkien", "broadcasting", "grief"],
    sources: [
      { title: "Mere Christianity", author: "C. S. Lewis", type: "book" },
      { title: "Surprised by Joy", author: "C. S. Lewis", type: "book" },
      { title: "A Grief Observed", author: "C. S. Lewis", type: "book" },
    ],
  },
  {
    id: "mother-teresa",
    name: "Mother Teresa",
    group: "modern",
    wikipedia: "Mother Teresa",
    timePeriod: "1910 - 1997",
    birthYear: "1910",
    deathYear: "1997",
    place: "Calcutta, India",
    description:
      "An Albanian nun who left a comfortable teaching convent to live in the slums, and who spent almost fifty years feeling that God was absent.",
    contribution:
      "Founded the Missionaries of Charity, who care for the dying, the abandoned and the untouchable in more than a hundred countries.",
    biography:
      "Agnes Bojaxhiu was Albanian, left home at eighteen, and never saw her mother again. She taught for nearly twenty years at a Loreto convent school in Calcutta, comfortable and well regarded, and became its headmistress.\n\nIn 1946, on a train to Darjeeling, she experienced what she described as a call within a call: to leave the convent and live among the poorest. It took two years to get permission. She walked out with five rupees.\n\nThe Missionaries of Charity began with a school in the open air, scratching letters in the dirt. Then came a home for the dying, opened in a disused temple hostel, where people found on the streets could die attended to rather than alone. Then leprosy clinics, orphanages, and eventually houses in over a hundred countries.\n\nHer letters, published against her wishes after her death, revealed something almost nobody knew. From roughly 1949 until her death she experienced an unbroken sense of God's absence -- what she called the darkness -- writing to her confessors of emptiness and of a smile that was a mask. She continued for nearly fifty years anyway, and came to understand it as sharing the abandonment of those she served.",
    complications:
      "Her homes have been criticised for poor medical standards and for treating suffering as valuable in itself, and for accepting donations from donors including Charles Keating. Her defenders answer that she ran hospices, not hospitals, for people no hospital would admit. Both criticism and defence are made in good faith and the argument is unresolved.",
    famousQuote: "Not all of us can do great things. But we can do small things with great love.",
    bibleVerse: {
      text: "Truly I say to you, as you did it to one of the least of these my brothers, you did it to me.",
      reference: "Matthew 25:40",
    },
    keyEvents: [
      { year: "1928", description: "Leaves Albania at eighteen to join the Loreto Sisters" },
      { year: "1946", description: "Experiences the \"call within a call\" on a train to Darjeeling" },
      { year: "1950", description: "Founds the Missionaries of Charity" },
      { year: "1952", description: "Opens the home for the dying in Calcutta" },
      { year: "1979", description: "Awarded the Nobel Peace Prize" },
    ],
    tags: ["calcutta","poverty","dying","albania","nobel","darkness","charity"],
    sources: [
      { title: "Mother Teresa: Come Be My Light", author: "Brian Kolodiejchuk", type: "book" },
    ],
  },
  {
    id: "billy-graham",
    name: "Billy Graham",
    group: "modern",
    wikipedia: "Billy Graham",
    timePeriod: "1918 - 2018",
    birthYear: "1918",
    deathYear: "2018",
    place: "United States",
    description:
      "A North Carolina farm boy who preached in person to more people than anyone in history, and desegregated his own crusades before the law required it.",
    contribution:
      "Preached to an estimated 215 million people in 185 countries, and set financial and moral safeguards that became a standard for evangelists.",
    biography:
      "Graham grew up on a dairy farm and was converted at sixteen at a travelling revival. He was preaching to crowds in his twenties and became internationally famous after a 1949 tent campaign in Los Angeles that was scheduled for three weeks and ran for eight.\n\nEarly on he and his team drew up what became known as the Modesto Manifesto, a set of rules aimed at the failures that had ruined other evangelists: never be alone with a woman other than his wife, never handle the money himself, never inflate attendance figures, and never criticise local churches. He kept to them for sixty years, and no financial or sexual scandal ever touched him -- which, given the field, is itself notable.\n\nOn race he moved earlier than most white Southern evangelicals. In 1953 in Chattanooga he personally pulled down the ropes separating black and white sections, and afterwards refused to preach to a segregated audience. He invited Martin Luther King Jr to pray at his 1957 New York crusade and paid bail when King was jailed.\n\nHe advised presidents from Truman onward, which brought him closest to real damage: tapes released decades later caught him agreeing with antisemitic remarks by Richard Nixon. When they surfaced he apologised without qualification, saying he had no memory of it and that it did not sound like him but that he must have said it.",
    complications:
      "Beyond the Nixon tapes, his closeness to political power drew criticism throughout his life, including from his own son. He came to say he regretted it and that an evangelist should stay out of partisan politics -- advice his own family has not always taken.",
    famousQuote: "My home is in heaven. I'm just travelling through this world.",
    bibleVerse: {
      text: "For God so loved the world, that he gave his only Son.",
      reference: "John 3:16",
    },
    keyEvents: [
      { year: "1934", description: "Converted at sixteen at a revival meeting" },
      { year: "1948", description: "The team adopts the Modesto Manifesto safeguards" },
      { year: "1949", description: "The Los Angeles tent campaign makes him nationally famous" },
      { year: "1953", description: "Pulls down the segregation ropes at his Chattanooga crusade" },
      { year: "1957", description: "Invites Martin Luther King Jr to pray at his New York crusade" },
    ],
    tags: ["evangelist","crusades","america","segregation","integrity","radio","presidents"],
    sources: [
      { title: "Just As I Am", author: "Billy Graham", type: "book" },
      { title: "A Prophet with Honor", author: "William Martin", type: "book" },
    ],
  },
];
