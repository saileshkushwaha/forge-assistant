/**
 * localStorage keys for AI settings.
 *
 * Centralized here so keys are discoverable and consistent. Each card
 * reads/writes via `getLocalSetting` / `setLocalSetting` using these
 * constants as the key argument.
 */

export const LS_IMAGE_GEN_PROVIDER = "forge:ai:imageGenProvider";
export const LS_IMAGE_GEN_MODEL = "forge:ai:imageGenModel";
export const LS_WEB_SEARCH_PROVIDER = "forge:ai:webSearchProvider";
export const LS_WEB_FETCH_PROVIDER = "forge:ai:webFetchProvider";
export const LS_EMAIL_MODE = "forge:ai:emailMode";
export const LS_EMAIL_BYO_PROVIDER = "forge:ai:emailByoProvider";

export const LS_TTS_PROVIDER = "forge:voice:ttsProvider";
export const LS_TTS_API_KEY_PREFIX = "forge:voice:ttsApiKey:";
export const LS_TTS_VOICE_ID_PREFIX = "forge:voice:ttsVoiceId:";
export const LS_STT_PROVIDER = "forge:voice:sttProvider";
export const LS_STT_API_KEY_PREFIX = "forge:voice:sttApiKey:";
