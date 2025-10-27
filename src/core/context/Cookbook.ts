import "reflect-metadata";
import Chef from "./Chef.js";
import Recipe from "./Recipe.js";

export const INGREDIENTS_METADATA = Symbol.for("chef:ingredients");

export interface IngredientDescriptor {
  rootToken: string;
  jsonPath?: string; // RFC 9535-style JSONPath expression like "$.foo.bar[0]"
}

// Helper: take "Foo.bar[0].baz" and turn it into
//   rootToken = "Foo"
//   jsonPath  = "$.bar[0].baz"
function parseIngredientSpec(spec: string): IngredientDescriptor {
  // split at first "."
  const dotIndex = spec.indexOf(".");
  if (dotIndex === -1) {
    // no dot => whole token, no subpath
    return {
      rootToken: spec,
      jsonPath: undefined,
    };
  }

  const rootToken = spec.slice(0, dotIndex).trim();
  const tail = spec.slice(dotIndex + 1).trim();

  // convert "a.b[0].c" -> "$.a.b[0].c"
  const jsonPath = "$." + tail;

  return {
    rootToken,
    jsonPath,
  };
}

// Decorator
export function ingredient(spec: string): ParameterDecorator {
  const desc = parseIngredientSpec(spec);

  return function (
    target: Object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) {
    if (!propertyKey) {
      throw new Error("@ingredient can only be used on instance methods");
    }

    const existing: (IngredientDescriptor | undefined)[] =
      Reflect.getOwnMetadata(INGREDIENTS_METADATA, target, propertyKey) || [];

    existing[parameterIndex] = desc;

    Reflect.defineMetadata(INGREDIENTS_METADATA, existing, target, propertyKey);
  };
}

// Auto-register recipes in the cookbook
export function cookbook<T extends Recipe<any>>(
  ctor: new (...args: any[]) => T
) {
  const token = (ctor as any).token ?? ctor.name;
  Chef.cookbook.set(token, ctor as any);
}
