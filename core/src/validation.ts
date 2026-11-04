import { LIMITS } from "./constants";
import { validationError } from "./errors";

// C0/C1 control characters, zero-width and bidi-override characters. Stripping
// these keeps user text from breaking layouts or spoofing other text.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Collapses whitespace and strips unsafe characters. */
export function cleanText(input: string): string {
  return input.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Feedback keeps its line breaks (up to one blank line in a row) but gets the
 * same stripping as other text, line by line.
 */
export function validateFeedbackText(input: unknown): string {
  if (typeof input !== "string") throw validationError("Feedback must be text.");
  const text = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) throw validationError("Write something first.");
  if (text.length > LIMITS.feedbackMaxLength) {
    throw validationError(`Keep feedback under ${LIMITS.feedbackMaxLength} characters.`);
  }
  return text;
}

export function validateGoalText(input: unknown): string {
  if (typeof input !== "string") throw validationError("Goal must be text.");
  const text = cleanText(input);
  if (text.length === 0) throw validationError("Goal can't be empty.");
  if (text.length > LIMITS.goalTextMaxLength) {
    throw validationError(`Keep goals under ${LIMITS.goalTextMaxLength} characters.`);
  }
  return text;
}

/** Validates the goals typed into the start sheet. Blank entries are dropped. */
export function validateStartGoals(inputs: readonly unknown[]): string[] {
  const goals = inputs
    .filter((g) => typeof g === "string" && cleanText(g).length > 0)
    .map(validateGoalText);
  if (goals.length > LIMITS.maxGoalsPerStart) {
    throw validationError(`Add up to ${LIMITS.maxGoalsPerStart} goals when you start.`);
  }
  return goals;
}

export function validateSoloMinutes(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input)) {
    throw validationError("Timer length must be a whole number of minutes.");
  }
  if (input < LIMITS.soloMinMinutes || input > LIMITS.soloMaxMinutes) {
    throw validationError(
      `Pick between ${LIMITS.soloMinMinutes} and ${LIMITS.soloMaxMinutes} minutes.`,
    );
  }
  return input;
}

/** Ids are opaque, but they still get a sanity check before touching storage. */
export function validateId(input: unknown, what = "id"): string {
  if (typeof input !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(input)) {
    throw validationError(`Invalid ${what}.`);
  }
  return input;
}

/**
 * Display names are user-controlled and end up in channel posts, so strip
 * anything that could be read as markup or a mention.
 */
export function safeDisplayName(input: string | undefined): string {
  const cleaned = cleanText(input ?? "")
    .replace(/[@<>*_~`|#[\]()\\]/g, "")
    .trim()
    .slice(0, LIMITS.displayNameMaxLength);
  return cleaned.length > 0 ? cleaned : "Someone";
}
