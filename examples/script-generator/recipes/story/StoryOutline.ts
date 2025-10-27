import { cookbook, ingredient } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";
import { MODEL_ID } from "../../../utils/constants";
import { ChatOpenAI } from "@langchain/openai";

import {
  type StoryOutlineSpecType,
  StoryOutlineSpec,
} from "../../specs/story/storyOutline";
import type { CharactersSpecType } from "../../specs/character/characters";

const llm = new ChatOpenAI({
  model: MODEL_ID,
  temperature: 0,
});

@cookbook
export class StoryOutline extends Recipe<StoryOutlineSpecType> {
  description = "Generates a story outline based on the story seed.";

  async prepare(
    @ingredient("storySeed") storySeed: string,
    @ingredient("Characters") characters: CharactersSpecType
  ): Promise<StoryOutlineSpecType> {
    const prompt = `# OBJECTIVE: Generate a high-level story outline based on the provided character information and story seed.
## Story Seed:\n
  ${storySeed}\n
## Character Information:\n
 ${JSON.stringify(characters, null, 2)}
`;
    const response = await llm
      .withStructuredOutput(StoryOutlineSpec)
      .invoke(prompt);

    return StoryOutlineSpec.parse(response);
  }
}
