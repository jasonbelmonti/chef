// Kitchen.ts
import "reflect-metadata";
import {
  INGREDIENTS_METADATA,
  type IngredientDescriptor,
} from "@lib/core/context/Cookbook";
import Recipe from "@lib/core/context/Recipe";
import { JSONPath } from "jsonpath-plus";

type RecipeCtor<TOut = unknown> = {
  new (): Recipe<TOut>;
  token?: string;
  name: string;
};

type ProviderOrValue<T> =
  | { type: "value"; value: T }
  | { type: "provider"; get: () => Promise<T> };

// A trace entry describing how a given token is produced,
// and what other tokens it depends on.
type TraceEntry = {
  token: string;
  providerName: string; // "pantry" or the recipe class name
  deps: Array<{ token: string; via: string }>;
};

// An order item can be a bare token string ("retrievedDocs") or
// an object that specifies a desired level-of-detail / view for that token.
// detail is caller intent: "full", "summary", "bullets", etc.
// Chef will propagate this through provenance so we know what view we tried
// to plate. (Compression-for-budget may still further shrink it later.)
type OrderItem =
  | string
  | {
      token: string;
      detail?: string;
    };

// Per-token budgeting + provenance info for explain mode.
// Each "plate" is one item from the order, along with how/why it was
// (or wasn't) included in the final cooked context.
interface PlateInfo {
  token: string;

  // "forced-include" (first item, always plated),
  // "included" (fit within budget / selected by priority),
  // "dropped" (skipped to stay under budget even after compression attempts)
  decision: "forced-include" | "included" | "dropped";

  // short human-readable reason
  // e.g. "no budget provided", "compressed to fit budget",
  // "selected by priority within budget", "excluded due to budget/priority"
  reason: string;

  // which detail level we attempted to serve for this token
  // (e.g. "full", "summary", "bullets"). This reflects caller intent.
  servedDetail: string;

  // app-defined priority metadata for this token
  // priorityTag is straight from the recipe (whatever the recipe set),
  // priorityScore is the resolved numeric score after rankPriority()
  priorityTag?: string | number;
  priorityScore: number;

  // compression / sizing info
  wasCompressed: boolean;
  compressionNote?: string;

  // token cost accounting
  // originalCost: cost of the baseline (detailRequested) representation
  // compressedCost: cost of the compressed fallback representation (if any)
  // cost: the cost of whatever we actually plated (== originalCost unless compressed)
  originalCost: number;
  compressedCost?: number;
  cost: number;

  // running totals for final plated context
  runningTotalBefore: number; // tokens before considering this item
  runningTotalAfter: number; // tokens after applying this decision

  // full dependency lineage for this token
  lineage: TraceEntry[];
}

// Detailed result returned when calling cook({ explain: true }).
// Includes cooked context, per-item provenance, and budgeting info.
export interface CookExplainResult {
  context: string;
  totalTokens: number;
  budget?: number;
  plates: PlateInfo[];
}

export default class Chef<P extends Record<string, any>> {
  static cookbook = new Map<string, RecipeCtor<any>>();

  private instanceCache = new Map<RecipeCtor<any>, Recipe<any>>();
  private valueCache = new Map<RecipeCtor<any>, any>();
  private pantry = new Map<keyof P, ProviderOrValue<any>>();

  constructor(pantryInit: {
    [K in keyof P]: P[K] | (() => Promise<P[K]>);
  }) {
    for (const [token, thing] of Object.entries(pantryInit) as [
      keyof P,
      any
    ][]) {
      if (typeof thing === "function") {
        this.pantry.set(token, { type: "provider", get: thing });
      } else {
        this.pantry.set(token, { type: "value", value: thing });
      }
    }
  }

  /**
   * cook() assembles prepared items for a given "order".
   *
   * - "order" is which tokens you actually want plated for this turn.
   *   (If not provided, we fall back to cooking the entire cookbook.)
   *
   * - "budget" is an approximate token budget for the final plated context.
   *   Chef will choose the *best* set of items to fit under this budget,
   *   respecting caller-defined importance (priority). The first item in
   *   the order is always included, even if it alone exceeds the budget,
   *   because dropping everything is rarely useful.
   *
   * - "countTokens" is a caller-provided tokenizer. Chef does NOT assume
   *   a specific model's tokenizer. If omitted, we fall back to a naive
   *   heuristic (~4 characters per token).
   *
   * - "rankPriority" lets the caller define how important each token is.
   *   It receives a descriptor ({ token, recipeName, priorityTag, index })
   *   and returns a numeric score. Higher score === higher priority.
   *   If omitted, we fall back to a built-in heuristic that understands a few
   *   common strings like "critical" / "high" / "normal" / "low", or uses
   *   numeric priorityTag values directly.
   *
   *   Chef will use this score to decide which items (after the first)
   *   are worth including if the budget is tight. Higher-priority dishes
   *   are plated first.
   *
   * - "explain" asks Chef to also return per-item provenance ("plates"):
   *   how each token was handled, its token cost, running totals,
   *   priority info, and full dependency lineage.
   */
  // Overload: caller provides an order, optional budget, no explain
  async cook(options: {
    order: OrderItem[];
    budget?: number;
    countTokens?: (text: string) => number;
    rankPriority?: (info: {
      token: string;
      recipeName: string;
      priorityTag?: string | number;
      index: number;
    }) => number;
    explain?: false | undefined;
  }): Promise<string>;
  // Overload: caller provides an order, wants provenance
  async cook(options: {
    order: OrderItem[];
    budget?: number;
    countTokens?: (text: string) => number;
    rankPriority?: (info: {
      token: string;
      recipeName: string;
      priorityTag?: string | number;
      index: number;
    }) => number;
    explain: true;
  }): Promise<CookExplainResult>;
  // Overload: legacy call signature with no args
  async cook(): Promise<string>;
  // Implementation
  async cook(options?: {
    order?: OrderItem[];
    budget?: number;
    countTokens?: (text: string) => number;
    rankPriority?: (info: {
      token: string;
      recipeName: string;
      priorityTag?: string | number;
      index: number;
    }) => number;
    explain?: boolean;
  }): Promise<string | CookExplainResult> {
    const explain = options?.explain === true;
    const budget = options?.budget;

    // caller-provided tokenizer, or fallback heuristic
    const countTokensFn =
      options?.countTokens ??
      ((text: string) => {
        // naive fallback: ~4 chars per token
        return Math.ceil(text.length / 4);
      });

    // default priority ranker:
    // - numeric priorityTag wins (use directly)
    // - well-known strings get mapped
    // - otherwise fallback to 50
    const defaultRankPriority = (info: {
      token: string;
      recipeName: string;
      priorityTag?: string | number;
      index: number;
    }): number => {
      if (typeof info.priorityTag === "number") {
        return info.priorityTag;
      }
      if (typeof info.priorityTag === "string") {
        const map: Record<string, number> = {
          critical: 100,
          must: 90,
          high: 75,
          normal: 50,
          medium: 50,
          low: 25,
          optional: 10,
        };
        const lowered = info.priorityTag.toLowerCase();
        if (map[lowered] !== undefined) {
          return map[lowered];
        }
      }
      // pantry / unknown / unset
      return 50;
    };

    const rankPriorityFn = options?.rankPriority ?? defaultRankPriority;

    // Normalize the caller's "order" into a uniform structure:
    // [{ token, detail, index }, ...]
    // If no order is given, default to the entire cookbook with "full" detail.
    const orderListNormalized: Array<{
      token: string;
      detail: string;
      index: number;
    }> =
      options?.order && options.order.length > 0
        ? options.order.map((item, i) =>
            typeof item === "string"
              ? { token: item, detail: "full", index: i }
              : { token: item.token, detail: item.detail ?? "full", index: i }
          )
        : Array.from(Chef.cookbook.keys()).map((tok, i) => ({
            token: tok,
            detail: "full",
            index: i,
          }));

    // First pass: prep each requested token (at the requested detail level),
    // possibly transform via detailProfiles, measure token cost, and gather
    // lineage/priority metadata. We ALSO probe for an even more compressed
    // fallback form using summaryRecipe / compressible.
    const preparedItems: Array<{
      token: string;
      detailRequested: string;

      // Baseline materialization for this request's detail level
      baselineRendered: string;
      baselineCost: number;

      // Optional compressed fallback (for budget pressure)
      compressedRendered?: string;
      compressedCost?: number;
      compressionNote?: string;

      trace?: TraceEntry[];
      recipeName: string;
      priorityTag?: string | number;
      priorityScore: number;
      index: number;
    }> = [];

    for (const { token, detail, index } of orderListNormalized) {
      // resolve the base value via pantry/recipe
      const value = await this.prepare(token);

      // Identify the recipe (if any) for metadata and possible detailProfiles.
      const ctor = Chef.cookbook.get(token);
      const recipeName = ctor ? ctor.name : "pantry";
      const priorityTag = ctor ? (ctor as any).priority : undefined;

      // Start with the full prepared value (this is effectively "full" detail).
      let materialized: unknown = value;

      // If this recipe exposes alternate "detail" materializations (summary, bullets, etc.)
      // and the caller asked for such a detail level, prefer that.
      if (ctor && (ctor as any).detailProfiles) {
        const profiles = (ctor as any).detailProfiles as Record<
          string,
          (originalValue: unknown, ctx: { chef: any }) => Promise<unknown>
        >;
        const profileFn = profiles[detail];
        if (profileFn) {
          materialized = await profileFn(value, { chef: this });
        }
      }

      // Render the chosen materialization into a string for budgeting.
      const baselineRendered =
        typeof materialized === "string"
          ? materialized
          : JSON.stringify(materialized);

      const baselineCost = countTokensFn(baselineRendered);

      // Optionally compute a compressed fallback representation.
      // This is ONLY for emergency budget pressure. We do not prefer it
      // unless we cannot otherwise fit within budget.
      let compressedRendered: string | undefined = undefined;
      let compressedCost: number | undefined = undefined;
      let compressionNote: string | undefined = undefined;

      console.log(
        `Preparing token "${token}": baseline cost = ${baselineCost} tokens`
      );

      if (ctor && (ctor as any).compressible && (ctor as any).summaryRecipe) {
        const summaryToken = (ctor as any).summaryRecipe as string;
        // The summary recipe is expected to @ingredient("<token>") this recipe,
        // so calling chef.prepare(summaryToken) should yield a shorter version.
        try {
          console.log(
            "attempting to generate summary summaryToken:",
            summaryToken
          );
          const summaryVal = await this.prepare(summaryToken);
          const summaryStr =
            typeof summaryVal === "string"
              ? summaryVal
              : JSON.stringify(summaryVal);

          compressedRendered = summaryStr;
          compressedCost = countTokensFn(summaryStr);
          compressionNote = `compressed via ${summaryToken}`;
        } catch (err) {
          // If summaryRecipe fails for any reason, we just won't have a fallback.
          // We do not throw here because compression is best-effort.
          console.error("Error generating summary:", err);
        }
      }

      const priorityScore = rankPriorityFn({
        token,
        recipeName,
        priorityTag,
        index,
      });

      const traceEntries = explain ? await this.trace(token) : undefined;

      preparedItems.push({
        token,
        detailRequested: detail,
        baselineRendered,
        baselineCost,
        compressedRendered,
        compressedCost,
        compressionNote,
        trace: traceEntries,
        recipeName,
        priorityTag,
        priorityScore,
        index,
      });
    }

    // Phase 2: selection under budget.
    //
    // We want "best set under budget, guided by priorityScore".
    //
    // Rules:
    // - If no budget: include everyone, never use compressed fallback.
    // - If budget exists:
    //   - Always include the first item (index 0). We will prefer its compressed
    //     fallback if it exists and is smaller, but we include it even if it blows
    //     the budget by itself.
    //   - For remaining items:
    //     Sort by priorityScore DESC, then by (minCost) ASC, then by original index.
    //     For each candidate, try to fit baseline first. If baseline doesn't fit,
    //     try compressed fallback. If neither fits, drop it.
    //
    // After we decide which items are included and *which version* (baseline vs.
    // compressed) we are using, we will build the final plated context in the
    // ORIGINAL order (index asc), and produce detailed provenance.
    type PlanDecision = {
      include: boolean;
      forced: boolean;
      usedCompressed: boolean;
      usedRendered: string;
      usedCost: number;
      reason: string;
    };

    const plan = new Map<number, PlanDecision>();
    let plannedTotal = 0;

    if (budget === undefined) {
      // No budget: include everything with baseline form,
      // do not auto-compress.
      for (const item of preparedItems) {
        plan.set(item.index, {
          include: true,
          forced: item.index === 0 ? true : false,
          usedCompressed: false,
          usedRendered: item.baselineRendered,
          usedCost: item.baselineCost,
          reason: "no budget provided",
        });
        plannedTotal += item.baselineCost;
      }
    } else {
      // Budget IS defined.

      if (preparedItems.length > 0) {
        const first = preparedItems[0]!;

        // Prefer compressed fallback for the first item ONLY if
        // it's smaller. We include the first item regardless of fit.
        let useCompressedFirst = false;
        let renderedFirst = first.baselineRendered;
        let costFirst = first.baselineCost;
        let reasonFirst = "first item is always included";

        if (
          first.compressedRendered &&
          first.compressedCost !== undefined &&
          first.compressedCost < first.baselineCost
        ) {
          useCompressedFirst = true;
          renderedFirst = first.compressedRendered;
          costFirst = first.compressedCost;
          reasonFirst =
            "first item is always included (compressed to save budget)";
        }

        plan.set(first.index, {
          include: true,
          forced: true,
          usedCompressed: useCompressedFirst,
          usedRendered: renderedFirst,
          usedCost: costFirst,
          reason: reasonFirst,
        });
        plannedTotal += costFirst;
      }

      // Now rank remaining candidates by:
      // 1. priorityScore DESC
      // 2. cheapest viable cost ASC (min of baseline and compressed)
      // 3. original index ASC
      const candidates = preparedItems.slice(1).sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }

        const aMin = Math.min(
          a.baselineCost,
          a.compressedCost ?? Number.POSITIVE_INFINITY
        );
        const bMin = Math.min(
          b.baselineCost,
          b.compressedCost ?? Number.POSITIVE_INFINITY
        );

        if (aMin !== bMin) {
          return aMin - bMin;
        }

        return a.index - b.index;
      });

      for (const cand of candidates) {
        // Try baseline first.
        if (plannedTotal + cand.baselineCost <= budget) {
          plan.set(cand.index, {
            include: true,
            forced: false,
            usedCompressed: false,
            usedRendered: cand.baselineRendered,
            usedCost: cand.baselineCost,
            reason: "selected by priority within budget",
          });
          plannedTotal += cand.baselineCost;
          continue;
        }

        // Then try compressed fallback, if available.
        if (
          cand.compressedRendered &&
          cand.compressedCost !== undefined &&
          plannedTotal + cand.compressedCost <= budget
        ) {
          plan.set(cand.index, {
            include: true,
            forced: false,
            usedCompressed: true,
            usedRendered: cand.compressedRendered,
            usedCost: cand.compressedCost,
            reason: "compressed to fit budget",
          });
          plannedTotal += cand.compressedCost;
          continue;
        }

        // Can't fit this candidate, even compressed -> drop.
        plan.set(cand.index, {
          include: false,
          forced: false,
          usedCompressed: false,
          usedRendered: cand.baselineRendered,
          usedCost: Math.min(
            cand.baselineCost,
            cand.compressedCost ?? cand.baselineCost
          ),
          reason: "excluded due to budget/priority",
        });
      }
    }

    // Phase 3: build final plated context (in original order),
    // track running totals in plating order, and build plates[] provenance.
    const includedLines: string[] = [];
    let runningTotal = 0;
    const plates: PlateInfo[] = [];

    for (const item of preparedItems) {
      const before = runningTotal;
      const d = plan.get(item.index);

      if (!d) {
        // shouldn't happen unless logic above missed an index
        continue;
      }

      if (d.include) {
        includedLines.push(d.usedRendered + "\n");
        runningTotal += d.usedCost;
      }

      if (explain) {
        let decision: PlateInfo["decision"];

        if (!d.include) {
          decision = "dropped";
        } else if (budget === undefined) {
          decision = "included";
        } else if (item.index === 0) {
          decision = "forced-include";
        } else {
          decision = "included";
        }

        plates.push({
          token: item.token,
          decision,
          reason: d.reason,
          servedDetail: item.detailRequested,
          priorityTag: item.priorityTag,
          priorityScore: item.priorityScore,
          wasCompressed: d.usedCompressed,
          compressionNote: d.usedCompressed ? item.compressionNote : undefined,
          originalCost: item.baselineCost,
          compressedCost: item.compressedCost,
          cost: d.usedCost,
          runningTotalBefore: before,
          runningTotalAfter: runningTotal,
          lineage: item.trace ?? [],
        });
      }
    }

    const context = includedLines.join("\n");

    // if not explaining, return just the cooked context string.
    if (!explain) {
      return context;
    }

    // otherwise return full provenance
    return {
      context,
      totalTokens: runningTotal,
      budget,
      plates,
    };
  }

  /**
   * Build a dependency trace for a given token.
   *
   * The trace shows:
   *  - which provider produced the token ("pantry" or which recipe class)
   *  - which other tokens that provider depends on
   *  - transitive deps, recursively
   *
   * This is useful for observability / debugging ("why did we include this?")
   */
  async trace(rootToken: string): Promise<TraceEntry[]> {
    const seen = new Map<string, TraceEntry>();

    const visit = async (token: string) => {
      // avoid infinite loops / repeated work
      if (seen.has(token)) return;

      // Pantry-provided value?
      if (this.pantry.has(token as keyof P)) {
        seen.set(token, {
          token,
          providerName: "pantry",
          deps: [],
        });
        return;
      }

      // Recipe-provided value?
      const ctor = Chef.cookbook.get(token);
      if (!ctor) {
        throw new Error(
          `Chef.trace: token "${token}" not found in pantry or cookbook.`
        );
      }

      // Look at this recipe's @ingredient metadata to figure out deps
      const paramDescs: (IngredientDescriptor | undefined)[] =
        Reflect.getOwnMetadata(
          INGREDIENTS_METADATA,
          ctor.prototype,
          "prepare"
        ) || [];

      const deps: Array<{ token: string; via: string }> = [];

      for (const desc of paramDescs) {
        if (!desc) continue;

        // Record the dep and recurse
        const depToken = desc.rootToken;
        const prettyPath = desc.jsonPath ? `.${desc.jsonPath.slice(2)}` : "";

        deps.push({
          token: depToken,
          via: `@ingredient("${depToken}${prettyPath}")`,
        });

        await visit(depToken);
      }

      // Record this provider and its deps
      seen.set(token, {
        token,
        providerName: ctor.name,
        deps,
      });
    };

    await visit(rootToken);

    // Return stable array form
    return Array.from(seen.values());
  }

  // typed overload for pantry keys, same as before
  async prepare<K extends keyof P>(token: K): Promise<P[K]>;
  async prepare<TOut = any>(token: string): Promise<TOut>;
  async prepare(token: string): Promise<any> {
    // Try pantry first
    if (this.pantry.has(token as keyof P)) {
      const item = this.pantry.get(token as keyof P)!;
      if (item.type === "value") {
        return item.value;
      } else {
        return item.get();
      }
    }

    // Otherwise look for a recipe
    const ctor = Chef.cookbook.get(token);
    if (!ctor) {
      throw new Error(
        `Kitchen: no provider found for "${token}". ` +
          `It is neither in this Kitchen's pantry nor registered as a recipe.`
      );
    }

    // Memoized?
    if (this.valueCache.has(ctor)) {
      return this.valueCache.get(ctor);
    }

    // Otherwise, invoke recipe
    const cooked = await this.invokeRecipe(ctor);
    this.valueCache.set(ctor, cooked);
    return cooked;
  }

  private async invokeRecipe<TOut>(ctor: RecipeCtor<TOut>): Promise<TOut> {
    const instance = this.getInstance(ctor);

    const paramDescs: (IngredientDescriptor | undefined)[] =
      Reflect.getOwnMetadata(INGREDIENTS_METADATA, ctor.prototype, "prepare") ||
      [];

    const resolvedArgs: any[] = [];

    for (const desc of paramDescs) {
      if (!desc) {
        resolvedArgs.push(undefined);
        continue;
      }

      // 1. Resolve the root token normally (pantry or recipe)
      const rootVal = await this.prepare(desc.rootToken);

      // 2. If there's a subpath, drill into it
      let finalVal = rootVal;
      if (desc.jsonPath) {
        // SECURITY NOTE:
        // We're treating jsonPath here as trusted developer-authored code,
        // not user input. jsonpath-plus before 10.3.0 had RCE issues due to
        // unsafe eval behavior that could run arbitrary code if an attacker
        // controlled the path. We must pin >=10.3.0 to avoid that class of
        // vuln.  [oai_citation:3‡NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-1302?utm_source=chatgpt.com)
        finalVal = JSONPath({
          json: rootVal,
          path: desc.jsonPath,
          wrap: false, // return scalar directly if it's a single match  [oai_citation:4‡npm](https://www.npmjs.com/package/jsonpath-plus?utm_source=chatgpt.com)
        });
      }

      // 3. Optional: strict mode — throw on undefined to surface contract drift fast
      if (finalVal === undefined) {
        throw new Error(
          `Kitchen: @ingredient("${desc.rootToken}${
            desc.jsonPath ? "." + desc.jsonPath.slice(2) : ""
          }") resolved to undefined.`
        );
      }

      resolvedArgs.push(finalVal);
    }

    // Call the recipe
    return instance.prepare(...resolvedArgs);
  }

  private getInstance<TOut>(ctor: RecipeCtor<TOut>): Recipe<TOut> {
    let inst = this.instanceCache.get(ctor);
    if (!inst) {
      inst = new ctor();
      this.instanceCache.set(ctor, inst);
    }
    return inst as Recipe<TOut>;
  }
}
