// Core types used by Recipe.prepare(...) signatures to express resolved ingredients.
// These are kept mostly for IDE help and backwards compatibility with existing call sites.

type IngredientLike = { get(): Promise<unknown> };
export type IngredientList = readonly IngredientLike[];

export type PreparedIngredients<Ingredients extends IngredientList> = {
  [Index in keyof Ingredients]: Ingredients[Index] extends {
    get(): Promise<infer R>;
  }
    ? R
    : never;
};

export type RecipePreparation<
  Ingredients extends IngredientList = [],
  T = unknown
> = (...resolved: PreparedIngredients<Ingredients>) => Promise<T>;

export type IngredientProvider<T> = () => Promise<T>;

export interface RecipeOptions<
  Ingredients extends IngredientList = [],
  T = unknown
> {
  name: string;
  description: string;
  ingredients?: Ingredients;
  prepare: RecipePreparation<Ingredients, T>;
}

/**
 * Static-side metadata that Chef can optionally read from a recipe constructor.
 *
 * NOTE:
 * We intentionally keep this as a *separate* interface instead of declaring
 * these members directly as `static` fields on the abstract `Recipe` base class.
 *
 * Why?
 * - Projects often enable `noImplicitOverride: true`.
 * - If the base class declares `static priority?: ...`, then subclasses that
 *   set `static priority = "critical"` are considered overrides and must write
 *   `static override priority = "critical"`.
 * - We want subclasses to be able to just write `static priority = "critical"`
 *   (or `static compressible = true`, etc.) WITHOUT needing the `override`
 *   modifier.
 *
 * By *not* declaring these static fields on `Recipe` itself, we avoid forcing
 * `override` in consumers, while Chef can still read them reflectively via
 * `(ctor as any).priority`, `(ctor as any).compressible`, etc.
 */
export interface RecipeStaticHints {
  /**
   * Priority tag for budgeting / inclusion decisions.
   * This can be any string or number meaningful to the app
   * (e.g. "policy", "must-have", "supporting", 10, 5, etc.).
   * Chef will pass this through `rankPriority(...)` to get a numeric score.
   */
  priority?: string | number;

  /**
   * Optional soft target for how large (in tokens) this recipe's output
   * should be after compression. (Not yet enforced automatically, but
   * reserved for future heuristics.)
   */
  maxTokens?: number;

  /**
   * A token naming another recipe whose job is to summarize / compress THIS
   * recipe's output. Chef will attempt to call that summary recipe to obtain
   * a smaller `compressedRendered` version when we're tight on budget.
   *
   * Example:
   *   static summaryRecipe = "RetrievedDocsSummary";
   */
  summaryRecipe?: string;

  /**
   * Alternate "views" keyed by arbitrary detail labels ("full", "summary",
   * "bullets", etc.). Chef will honor `{ detail: "summary" }` in the order by
   * calling the matching profile if present.
   *
   * Each function receives:
   *  - originalValue: the result of this recipe's own prepare()
   *  - ctx: { chef } so it can call chef.prepare(...) for other tokens
   *
   * The return value is the representation to actually plate for that detail.
   */
  detailProfiles?: Record<
    string,
    (originalValue: unknown, ctx: { chef: any }) => Promise<unknown>
  >;
}

/**
 * Base class for all recipes.
 *
 * Subclasses MUST implement:
 *   - description: string
 *   - async prepare(...ingredients): Promise<T>
 *
 * Subclasses MAY (optionally) add static metadata fields like:
 *   static priority = "critical";
 *   static summaryRecipe = "SomeOtherRecipe";
 *   static detailProfiles = { summary: async (...) => "...", ... };
 *
 * Those static fields are NOT declared here on the base class on purpose,
 * so that subclasses do NOT need the `override` keyword under
 * `noImplicitOverride: true`. Chef accesses them reflectively.
 */
export default abstract class Recipe<T = string> {
  abstract readonly description: string;
  abstract prepare(...args: PreparedIngredients<IngredientList>): Promise<T>;
}
