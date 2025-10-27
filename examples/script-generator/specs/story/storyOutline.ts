import z from "zod";

const StoryOutlineSpec = z.object({
  summary: z.string().describe("A brief summary of the overall story outline"),
  genre: z.string().describe("The genre of the story"),
  themes: z
    .array(z.string())
    .describe("The central themes explored in the story"),
  scenes: z
    .array(
      z.object({
        title: z.string().describe("The title of the scene"),
        description: z
          .string()
          .describe("A brief description of what happens in the scene"),
        charactersInvolved: z
          .array(z.string())
          .describe("Names of characters involved in the scene"),
        setting: z
          .string()
          .describe("The setting or location where the scene takes place"),
        beats: z
          .array(
            z.object({
              beatDescription: z
                .string()
                .describe("A brief description of the individual beat"),
              purpose: z
                .string()
                .describe(
                  "The purpose of the beat in advancing the plot or character development"
                ),
            })
          )
          .describe("Key beats or moments within the scene"),
      })
    )
    .describe("A list of scenes that make up the story outline"),
});

type StoryOutlineSpecType = z.infer<typeof StoryOutlineSpec>;

export { type StoryOutlineSpecType, StoryOutlineSpec };
