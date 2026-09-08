import { PROMPT_LIBRARY, RECIPE_LIBRARY } from "./config.js";

const clean = (value) => typeof value === "string" ? value.trim() : "";

export function buildPrompt(promptId, values = {}) {
  const template = PROMPT_LIBRARY[promptId];
  if (!template) throw new Error(`Unknown prompt library entry: ${promptId}`);
  return template.parts(values).map(clean).filter(Boolean).join(", ");
}

export function buildRecipe(recipeId, values = {}) {
  const recipe = RECIPE_LIBRARY[recipeId];
  if (!recipe) throw new Error(`Unknown creative recipe: ${recipeId}`);

  const prompt = buildPrompt(recipe.promptId, values);
  const model = typeof recipe.model === "function" ? recipe.model(values) : recipe.model;
  return {
    providerId: recipe.providerId,
    model,
    prompt,
    ...recipe.defaults,
    ...values.parameters,
  };
}
