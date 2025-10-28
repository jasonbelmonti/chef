import { cookbook, ingredient } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";
import { llm } from "@examples/utils/llms";

import {
  type CharactersSpecType,
  CharactersSpec,
} from "../../specs/character/characters";

@cookbook
export class Characters extends Recipe<CharactersSpecType> {
  description = "Use the story seed to generate screenplay characters.";

  static summaryRecipe = "CharactersSummary";

  async prepare(
    @ingredient("storySeed") seed: string
  ): Promise<CharactersSpecType> {
    const prompt = `# OBJECTIVE: Generate characters for a screenplay based on the provided seed text.
# REQUIREMENTS:
- At least one character must have role "protagonist".
## Seed Text:\n
 ${seed}
`;
    const response = await llm
      .withStructuredOutput(CharactersSpec)
      .invoke(prompt);

    return CharactersSpec.parse(response);
  }
}
