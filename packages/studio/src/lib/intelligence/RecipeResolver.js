import { RECIPE_LIBRARY } from "./config.js";
import "./ProductionCapabilityCatalog.js";

export const CANONICAL_OPERATION_DEFAULT_RECIPES = Object.freeze({
  image_generation: "image",
  image_editing: "image-edit",
});

export class RecipeResolver {
  constructor({ recipes = RECIPE_LIBRARY, operationDefaults = CANONICAL_OPERATION_DEFAULT_RECIPES } = {}) {
    this.recipes = recipes;
    this.operationDefaults = operationDefaults;
  }

  resolve(recipeId) {
    const recipe = this.recipes[recipeId]
      || Object.values(this.recipes).find((candidate) => candidate?.id === recipeId);
    if (!recipe) throw new Error(`Unknown creative recipe: ${recipeId}`);
    return recipe;
  }

  defaultRecipeIdForOperation(operation) {
    const normalized = typeof operation === "string" ? operation.trim() : "";
    return normalized ? this.operationDefaults[normalized] || null : null;
  }

  compile(recipeId, input = {}) {
    const recipe = this.resolve(recipeId);
    return {
      id: recipe.id || recipeId,
      version: recipe.version || 1,
      providerId: recipe.providerId || null,
      model: typeof recipe.model === "function" ? recipe.model(input) : recipe.model || null,
      defaults: { ...(recipe.defaults || {}) },
      capabilityRequirements: Array.isArray(recipe.capabilityRequirements) ? [...recipe.capabilityRequirements] : [],
      memoryTypes: Array.isArray(recipe.memoryTypes) ? [...recipe.memoryTypes] : [],
      input,
    };
  }
}
