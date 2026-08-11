// Creative OS — Character Lip Sync shared constants.
//
// Single source of truth for the Talking Avatar and Character Lip Sync
// skill/recipe identity used by the job builder, provider execution, runtime,
// and Character Studio. Both capabilities execute through the existing
// lip_sync provider operation (image_url + audio_url for Talking Avatar,
// video_url + audio_url for Character Lip Sync). Nobody hardcodes these values.

export const TALKING_AVATAR_SKILL_ID = "talking-avatar";
export const TALKING_AVATAR_RECIPE_ID = "talkingAvatar";
export const TALKING_AVATAR_OUTPUT_SUBTYPE = "talking avatar";

export const CHARACTER_LIPSYNC_SKILL_ID = "character-lip-sync";
export const CHARACTER_LIPSYNC_RECIPE_ID = "characterLipSync";
export const CHARACTER_LIPSYNC_OUTPUT_SUBTYPE = "character lip sync";

export const CHARACTER_LIPSYNC_OPERATION = "lip_sync";
export const CHARACTER_LIPSYNC_CAPABILITY = "lip_sync";
export const CHARACTER_LIPSYNC_PROVIDER_ID = "muapi";
