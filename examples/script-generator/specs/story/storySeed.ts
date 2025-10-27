import z from "zod";

const StorySeedInput = z.object({
  storySeed: z.string().describe("The seed text for the story"),
});

type StorySeedInputType = z.infer<typeof StorySeedInput>;

export { type StorySeedInputType, StorySeedInput };
