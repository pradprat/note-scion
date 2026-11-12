/**
 * The icon picker's emoji (src/lib/emoji.ts):
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import { EMOJI_GROUPS, RESULTS, searchEmoji } from "@/lib/emoji";

const emojiOf = (groups: ReturnType<typeof searchEmoji>) => groups.flatMap((g) => g.entries.map((e) => e.emoji));

describe("emoji", () => {
  test("every entry is one emoji with words, short enough to save as an icon", () => {
    for (const group of EMOJI_GROUPS) {
      for (const { emoji, words } of group.entries) {
        expect(emoji).not.toContain(" ");
        expect(/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(emoji)).toBe(true);
        expect([...new Intl.Segmenter().segment(emoji)]).toHaveLength(1);
        // src/app/actions.ts refuses icons longer than 16.
        expect(emoji.length).toBeLessThanOrEqual(16);
        expect(words.trim()).not.toBe("");
      }
    }
  });

  test("an empty search shows every emoji once, the old set included", () => {
    const all = emojiOf(searchEmoji(""));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThan(300);
    for (const old of ["📝", "🗂️", "🧾", "⚠️", "🧭", "🛠️", "✈️", "❤️"]) expect(all).toContain(old);
  });

  test("a search matches the start of a word, with every term", () => {
    expect(emojiOf(searchEmoji("heart"))).toContain("💙");
    expect(emojiOf(searchEmoji("heart blue"))).toEqual(["💙"]);
    expect(emojiOf(searchEmoji("  ROCK "))).toEqual(["🚀"]);
    expect(emojiOf(searchEmoji("eart"))).not.toContain("❤️");
    expect(searchEmoji("zzzz")).toEqual([]);
  });

  test("a search's matches come as one group, best first", () => {
    const hearts = searchEmoji("heart");
    expect(hearts.map((g) => g.name)).toEqual([RESULTS]);
    // ❤️ is a "heart" first; 😍 is "love heart eyes", and 🩺 a "health" thing that only
    // starts with "he", so neither leads.
    expect(emojiOf(hearts)[0]).toBe("❤️");
    expect(emojiOf(hearts).indexOf("❤️")).toBeLessThan(emojiOf(hearts).indexOf("😍"));
    expect(emojiOf(searchEmoji("write"))).toContain("✍️");
  });

  test("a group's name finds its emoji, after emoji named for the word", () => {
    const food = emojiOf(searchEmoji("food"));
    expect(food).toContain("🍕");
    expect(food).toContain("☕");
    expect(emojiOf(searchEmoji("drink"))[0]).toBe("🥤");
  });
});
