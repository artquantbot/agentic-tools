import * as z from "zod";
import { repoKey, requestText } from "./sources.ts";

const endpoint = "https://hacker-news.firebaseio.com/v0";
const feed = await requestText(endpoint + "/newstories.json");
const ids = z.array(z.int().positive()).parse(JSON.parse(feed.body)).slice(0, 24);
const itemSchema = z.object({
  id: z.int().positive(), type: z.literal("story"), url: z.string().optional(),
  time: z.int().positive(), deleted: z.boolean().optional(), dead: z.boolean().optional()
});
const leads = new Map<string, { repository: string; discussion: string; submittedAt: string }>();
for (let offset = 0; offset < ids.length; offset += 4) {
  await Promise.all(ids.slice(offset, offset + 4).map(async id => {
    try {
      const result = await requestText(`${endpoint}/item/${id}.json`);
      const item = itemSchema.safeParse(JSON.parse(result.body));
      if (!item.success || item.data.dead || item.data.deleted || !item.data.url?.startsWith("https://github.com/")) return;
      const key = repoKey(item.data.url);
      if (!key) return;
      const submittedAt = new Date(item.data.time * 1000).toISOString();
      if ((leads.get(key)?.submittedAt ?? "") < submittedAt) {
        leads.set(key, { repository: `https://github.com/${key}`, discussion: `https://news.ycombinator.com/item?id=${id}`, submittedAt });
      }
    } catch (error) {
      console.warn(`Hacker News item ${id} unavailable: ${(error as Error).message}`);
    }
  }));
}
console.log(JSON.stringify({
  provenance: "Hacker News New Stories", observedAt: feed.checkedAt, leads: [...leads.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}, null, 2));
