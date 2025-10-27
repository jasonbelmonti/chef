import z from "zod";
const CharactersSpec = z
  .object({
    characters: z
      .array(
        z.object({
          name: z.string().describe("The name of the character"),
          role: z.string().describe("The role of the character in the story"),
          description: z
            .string()
            .describe("A brief description of the character"),
          arc: z.string().describe("A description of the character's arc"),
        })
      )
      .describe("A list of characters generated for the story"),
  })
  .describe("The characters generated for the story");

type CharactersSpecType = z.infer<typeof CharactersSpec>;

export { type CharactersSpecType, CharactersSpec };
