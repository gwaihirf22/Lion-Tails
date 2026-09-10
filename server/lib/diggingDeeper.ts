/**
 * Answering what the reader actually wanted to know about a real account.
 *
 * WHY THIS IS A SECOND CALL AND NOT PART OF THE STORY.
 *
 * A model asked to answer a history question inside a scene answers it by
 * inventing history. That is the one failure this whole prompt layer is
 * arranged to prevent -- the account block, the cautions, the "do not invent a
 * name, an age or a number for anyone the account leaves unnamed". Weaving
 * answers into the narrative would put a question that wants a fact in the one
 * place where the model is licensed to imagine.
 *
 * So the story is written first, and untouched, and the answers come
 * afterwards in a block of their own, from a call that has the source material
 * in front of it and no story to write.
 *
 * WHY IT IS JSON AND NOT PROSE. The section is rendered here, from the parts,
 * so its shape is ours whatever the model does with formatting. That matters
 * because the reader parses markdown structurally: a block whose every line
 * starts with "- " becomes a list and flattens a question and its answer into
 * peers, and a lone short bold line becomes a heading. Rendering from JSON
 * means a model that ignores the formatting instructions cannot produce a
 * section that reads as something else.
 */

import type OpenAI from "openai";
import { requestModelJson, TOKEN_BUDGET } from "./openai-implementation";
import { temperatureFor, tokenLimitFor } from "./modelPolicy";
import { DIGGING_DEEPER_HEADING } from "@shared/storyAppendices";
import type { StoryBrief } from "./storyBrief";

/**
 * What a question can be answered FROM.
 *
 * Taken off the frozen brief rather than looked up fresh. The worker builds
 * every prompt from `deserialiseBrief(job.brief)` on purpose -- so that a hero
 * or a character edited half way through a generation cannot change the story
 * underneath it -- and re-reading the database here would reintroduce exactly
 * that, in the one section that claims to be factual.
 *
 * The passage case carries no material at all, because a typed reference is
 * all the app has: there is no anchor and no cautions for "Psalm 23". It is
 * still worth answering, and the prompt is told plainly that it is working
 * from the passage itself rather than from anything supplied.
 */
export type DiggingSource =
  | { kind: "account"; material: NonNullable<StoryBrief["sourceMaterial"]> }
  | { kind: "passage"; reference: string };

export type DiggingAnswer = { question: string; answer: string };

/** How many words each answer should run to. Short enough to be read. */
const WORDS_PER_ANSWER = 120;

/**
 * The prompt, pure and exported so it can be asserted without spending a call.
 *
 * The buildAvatarPrompt precedent: the durable artefact is the string, and
 * being able to read it in a test is the point.
 */
export function buildDiggingDeeperPrompt(
  source: DiggingSource,
  questions: string[],
): { system: string; user: string } {
  const system =
    "You answer questions about real history and real Scripture for someone " +
    "who has just read a story about it. You answer from the material you are " +
    "given and from nothing else. " +
    // The single most important line here, and the reason this is a separate
    // call: the honest answer to most good questions about an ancient text is
    // that it does not say, and a model writing a story will always rather
    // invent than disappoint.
    "Where the material does not answer a question, you say so plainly and " +
    "stop -- that is a real answer and a useful one, not a failure. You never " +
    "invent a name, a date, a number or an event to fill a gap, and you never " +
    "guess at someone's motive as though it were recorded.";

  const parts: string[] = [];
  if (source.kind === "account") {
    const m = source.material;
    parts.push(`WHAT THIS IS ABOUT: ${m.label}${m.passage ? ` (${m.passage})` : ""}`);
    parts.push("");
    parts.push("THE MATERIAL -- answer from this:");
    parts.push(m.account);
    if (m.keyVerse) {
      parts.push("");
      parts.push(
        `Key verse -- quote it exactly as given here or not at all: ` +
          `"${m.keyVerse.text}" -- ${m.keyVerse.reference}`,
      );
    }
    if (m.cautions.length) {
      parts.push("");
      // The cautions are already written as "here is the error people make
      // about this text", which is very close to being answers already.
      parts.push("THINGS PEOPLE GET WRONG ABOUT THIS -- correct them if asked:");
      m.cautions.forEach((c) => parts.push(`  - ${c}`));
    }
  } else {
    parts.push(`WHAT THIS IS ABOUT: the passage ${source.reference}.`);
    parts.push("");
    parts.push(
      "You have the reference and nothing else -- no summary of it has been " +
        "supplied. Answer from the passage itself, quote it where you quote it " +
        "at all, and be especially careful to say when the text does not " +
        "address something rather than reaching for a tradition about it.",
    );
  }

  parts.push("");
  parts.push("THE QUESTIONS, in this order:");
  questions.forEach((q, i) => parts.push(`  ${i + 1}. ${q}`));
  parts.push("");
  parts.push(
    `Answer each one in about ${WORDS_PER_ANSWER} words, in plain prose. ` +
      "Give the chapter and verse, or the year, whenever the answer has one. " +
      "Do not retell the story back at them; they have just read it.",
  );
  parts.push("");
  parts.push(
    'Respond with ONLY a valid JSON object: ' +
      '{ "answers": [{ "question": "...", "answer": "..." }] }, ' +
      "one entry per question, in the order given.",
  );

  return { system, user: parts.join("\n") };
}

/**
 * Render the section, from the parts.
 *
 * The question is echoed rather than assumed to be remembered: a reader coming
 * back to a saved story months later has no idea what they typed.
 *
 * Italic for the question, not bold and not a bullet -- both of those are
 * shapes the reader's parser turns into something else.
 */
export function renderDiggingDeeper(answers: DiggingAnswer[]): string {
  if (answers.length === 0) return "";
  const body = answers
    .map((a) => `*You asked: ${a.question.trim()}*\n\n${a.answer.trim()}`)
    .join("\n\n");
  return `\n\n${DIGGING_DEEPER_HEADING}\n\n${body}`;
}

/**
 * Ask, and render. Returns "" rather than throwing, on every failure.
 *
 * NEVER THROWS, and that is load-bearing rather than tidy. This runs after
 * every chapter has been written and paid for, and the worker retries a failed
 * job whole -- so an exception here would regenerate the entire story, make
 * the user wait a second time, and do it again on the next attempt. The same
 * reasoning as generateStoryImage, which is the call that established it.
 *
 * The assembled story is deliberately NOT in this prompt. Putting it there
 * would rebuild the headroom problem that broke long stories, and it is not
 * needed: the questions are about the account, not about the telling.
 */
export async function generateDiggingDeeper(
  client: OpenAI,
  model: string,
  source: DiggingSource,
  questions: string[],
  debugData: unknown[],
): Promise<string> {
  const asked = questions.map((q) => q.trim()).filter(Boolean);
  if (asked.length === 0) return "";

  const { system, user } = buildDiggingDeeperPrompt(source, asked);
  try {
    const reply = await requestModelJson<{ answers: DiggingAnswer[] }>({
      step: "diggingDeeper",
      model,
      debugData: debugData as any[],
      maxTokens: TOKEN_BUDGET.json,
      prompt: user,
      call: async (maxTokens) => {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          // Cooler than the story. This section is meant to be accurate, and
          // the story's warmth is exactly what should not be applied to it.
          ...temperatureFor(model, 0.2),
          ...tokenLimitFor(model, maxTokens),
        });
        return {
          content: response.choices[0].message.content || "",
          finishReason: response.choices[0].finish_reason,
          usage: response.usage,
        };
      },
      validate: (value) =>
        Array.isArray(value?.answers) &&
        value.answers.every(
          (a: unknown) =>
            typeof (a as DiggingAnswer)?.question === "string" &&
            typeof (a as DiggingAnswer)?.answer === "string",
        )
          ? value
          : undefined,
    });
    return renderDiggingDeeper(reply.answers.filter((a) => a.answer.trim()));
  } catch (error) {
    // A story is not worth failing over a section that did not generate.
    console.error("[diggingDeeper] could not answer the reader's questions:", error);
    return "";
  }
}
