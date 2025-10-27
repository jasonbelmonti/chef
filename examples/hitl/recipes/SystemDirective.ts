import { cookbook } from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";

@cookbook
export class SystemDirective extends Recipe<string> {
  description = "The system directive for HITL interactions.";

  static priority = 20;

  async prepare(): Promise<string> {
    return "## OBJECTIVE: Assist the user to the best of your ability.";
  }
}
