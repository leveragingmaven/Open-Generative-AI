import { RECIPE_LIBRARY } from "./config.js";
import "./ProductionCapabilityCatalog.js";

export class RecipeResolver {
  constructor({ recipes = RECIPE_LIBRARY } = {}) {
    this.recipes = recipes;
  }

  resolve(recipeId) {
    const recipe = this.recipes[recipeId];
    if (!recipe) throw new Error(`Unknown creative recipe: ${recipeId}`);
    return recipe;
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
