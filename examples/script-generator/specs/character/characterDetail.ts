import z from "zod";
const CharacterDetailSpec = z
  .object({
    name: z.string().describe("The name of the character"),
    role: z.string().describe("The role of the character in the story"),
    physicalDescription: z
      .string()
      .describe(
        "A physical description of the character focusing on distinctive features"
      ),
    background: z.string().describe("The character's background and history"),
    arc: z.string().describe("A description of the character's arc"),
    motivations: z
      .string()
      .describe("The character's motivations driving their actions"),
    conflicts: z
      .string()
      .describe("The internal and external conflicts faced by the character"),
    relationships: z
      .string()
      .describe("Key relationships with other characters in the story"),
  })
  .describe("Detailed information about a character");

type CharacterDetailSpecType = z.infer<typeof CharacterDetailSpec>;

export { type CharacterDetailSpecType, CharacterDetailSpec };
