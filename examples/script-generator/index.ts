import "dotenv/config";

import Chef from "@lib/core/context/Chef";
import "@examples/script-generator/recipes";

import type { StorySeedInputType } from "@examples/script-generator/specs/story/storySeed";
import { countTokens } from "@examples/utils/tokens";

const main = async () => {
  const chef = new Chef<StorySeedInputType>({
    storySeed: async () =>
      "In the far future, humanity is ruled by 'Intelligences' - once-human gestalt AIs that govern vast interstellar empires. Amidst political intrigue and rebellion, a young smuggler discovers a hidden secret that could change the fate of humanity forever.",
  });

  const plated = await chef.cook({
    order: ["StoryOutline"],
    explain: true,
    countTokens,
  });

  console.log("plated:", JSON.stringify(plated, null, 2));
};

main();
