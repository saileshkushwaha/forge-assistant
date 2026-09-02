/**
 * IPC channel name constants.
 *
 * Using string constants (rather than inline literals) catches typos at
 * compile time and makes the full channel surface grep-able from a single
 * location. Channels are grouped by the bridge surface they belong to.
 */

// App
export const APP_VERSION_INFO = "forge:app:versionInfo";
export const APP_OPEN_WEBSITE = "forge:app:openWebsite";

// Config
export const CONFIG_GET = "forge:config:get";

// Text insertion
export const TEXT_INSERT = "forge:text:insertIntoFrontApp";
export const TEXT_OPEN_SETTINGS = "forge:text:openAutomationSettings";

// System permissions
export const PERMISSIONS_GET_STATE = "forge:permissions:getState";
export const PERMISSIONS_REQUEST = "forge:permissions:request";
export const PERMISSIONS_OPEN_SETTINGS = "forge:permissions:openSettings";
export const PERMISSIONS_QUIT_AND_REOPEN = "forge:permissions:quitAndReopen";
export const PERMISSIONS_STATE_EVENT = "forge:permissions:state";

// Auth
export const AUTH_START_OAUTH = "forge:auth:startOAuth";
export const AUTH_CANCEL_OAUTH = "forge:auth:cancelOAuth";
export const AUTH_GET_SESSION_TOKEN = "forge:auth:getSessionToken";
export const AUTH_SIGN_OUT = "forge:auth:signOut";

// Hotkeys
export const HOTKEYS_GET = "forge:hotkeys:get";
export const HOTKEYS_SET = "forge:hotkeys:set";
export const HOTKEYS_CHANGED = "forge:hotkeys:changed";

// Launch at login
export const LAUNCH_AT_LOGIN_GET = "forge:launchAtLogin:get";
export const LAUNCH_AT_LOGIN_SET = "forge:launchAtLogin:set";

// Feature flags
export const FEATURE_FLAGS_SET = "forge:featureFlags:set";

// Diagnostics
export const DIAGNOSTICS_SET_SHARE = "forge:diagnostics:setShareDiagnostics";

// Helper (native sidecar)
export const HELPER_PING = "forge:helper:ping";
export const HELPER_GET_STATE = "forge:helper:state:get";
export const HELPER_RESTART = "forge:helper:restart";
export const HELPER_STATE_EVENT = "forge:helper:state";
export const HELPER_HOTKEY_FN_PTT = "forge:helper:hotkey:fnPushToTalk";
export const HELPER_HOTKEY_SET_VOICE_MODE_CHORD =
  "forge:helper:hotkey:setVoiceModeChord";
export const HELPER_HOTKEY_SET_MODIFIER_HOLD =
  "forge:helper:hotkey:setModifierHold";
export const HELPER_HOTKEY_EVENT = "forge:helper:hotkey:event";
export const HELPER_HOTKEY_REGISTRATION_EVENT =
  "forge:helper:hotkey:registration";
export const HELPER_DICTATION_SET_PARTIALS =
  "forge:helper:dictation:setPartials";
export const HELPER_DICTATION_PARTIAL_EVENT = "forge:helper:dictation:partial";
export const HELPER_DICTATION_FINALIZED_EVENT =
  "forge:helper:dictation:finalized";
export const HELPER_DICTATION_TRANSCRIBE = "forge:helper:dictation:transcribe";
export const HELPER_DICTATION_TRANSCRIBED_EVENT =
  "forge:helper:dictation:transcribed";

// Commands
export const COMMAND_EVENT = "forge:command";

// Status
export const STATUS_CONNECTION = "forge:status:connection";

// Identity
export const IDENTITY_NAME = "forge:identity:name";

// Icon / avatar
export const ICON_SET_AVATAR = "forge:icon:setAvatar";
export const ICON_SET_CHARACTER = "forge:icon:setCharacter";

// Dock
export const DOCK_SET_BADGE = "forge:dock:setBadge";

// Downloads
export const DOWNLOADS_DONE_EVENT = "forge:downloads:done";
export const DOWNLOADS_REVEAL = "forge:downloads:reveal";

// Local mode
export const LOCAL_MODE_HATCH = "forge:localMode:hatch";
export const LOCAL_MODE_READ_LOCKFILE = "forge:localMode:readLockfile";
export const LOCAL_MODE_SAVE_ASSISTANT =
  "forge:localMode:saveLockfileAssistant";
export const LOCAL_MODE_REPLACE_PLATFORM =
  "forge:localMode:replacePlatformAssistants";
export const LOCAL_MODE_RETIRE = "forge:localMode:retire";
export const LOCAL_MODE_UNPAIR = "forge:localMode:unpair";
export const LOCAL_MODE_SLEEP = "forge:localMode:sleep";
export const LOCAL_MODE_WAKE = "forge:localMode:wake";
export const LOCAL_MODE_UPGRADE = "forge:localMode:upgrade";
export const LOCAL_MODE_STATUS = "forge:localMode:status";
export const LOCAL_MODE_GUARDIAN_TOKEN = "forge:localMode:guardianToken";
export const LOCAL_MODE_READ_ASSISTANT_AVATAR =
  "forge:localMode:readAssistantAvatar";

// Menu
export const MENU_SET_PLATFORM_SESSION = "forge:menu:setPlatformSession";
export const MENU_TITLES = "forge:menu:titles";
export const MENU_POPUP = "forge:menu:popup";

// Main window
export const MAIN_WINDOW_ENSURE_VISIBLE = "forge:mainWindow:ensureVisible";
export const MAIN_WINDOW_SET_ONBOARDING = "forge:mainWindow:setOnboarding";
export const MAIN_WINDOW_SET_TITLE_BAR_OVERLAY =
  "forge:mainWindow:setTitleBarOverlay";

// Power events
export const POWER_EVENT = "forge:power:event";

// Deep links
export const DEEP_LINKS_DRAIN = "forge:deepLinks:drain";
export const DEEP_LINKS_SUBSCRIBE = "forge:deepLinks:subscribe";
export const DEEP_LINKS_UNSUBSCRIBE = "forge:deepLinks:unsubscribe";
export const DEEP_LINKS_EVENT = "forge:deepLinks:event";

// File open
export const FILE_OPEN_DRAIN = "forge:fileOpen:drain";
export const FILE_OPEN_SUBSCRIBE = "forge:fileOpen:subscribe";
export const FILE_OPEN_UNSUBSCRIBE = "forge:fileOpen:unsubscribe";
export const FILE_OPEN_EVENT = "forge:fileOpen:event";

// Feedback
export const FEEDBACK_DIAGNOSTICS = "forge:feedback:diagnostics";
export const FEEDBACK_LOGS = "forge:feedback:logs";

// Connectivity
export const CONNECTIVITY_GET = "forge:connectivity:get";
export const CONNECTIVITY_STATE = "forge:connectivity:state";
export const CONNECTIVITY_SET_DEVICE = "forge:connectivity:device";
export const CONNECTIVITY_RETRY = "forge:connectivity:retry";

// Notifications
export const NOTIFICATIONS_SHOW = "forge:notifications:show";
export const NOTIFICATIONS_ACTION = "forge:notifications:action";

// Bundle confirm
export const BUNDLE_CONFIRM_GET_DATA = "forge:bundleConfirm:getData";
export const BUNDLE_CONFIRM_RESPOND = "forge:bundleConfirm:respond";

// Quick input
export const QUICK_INPUT_SUBMIT = "forge:quickInput:submit";
export const QUICK_INPUT_DISMISS = "forge:quickInput:dismiss";

// Command palette
export const COMMAND_PALETTE_OPEN = "forge:commandPalette:open";
export const COMMAND_PALETTE_DISMISS = "forge:commandPalette:dismiss";
export const COMMAND_PALETTE_SELECT = "forge:commandPalette:select";

// Dictation overlay
export const DICTATION_OVERLAY_SET_STATE = "forge:dictationOverlay:setState";
export const DICTATION_OVERLAY_STATE_EVENT = "forge:dictationOverlay:state";
export const DICTATION_OVERLAY_GET_STATE = "forge:dictationOverlay:getState";
export const DICTATION_OVERLAY_REQUEST_STOP =
  "forge:dictationOverlay:requestStop";
export const DICTATION_OVERLAY_STOP_REQUESTED =
  "forge:dictationOverlay:stopRequested";
export const DICTATION_OVERLAY_SET_INTERACTIVE =
  "forge:dictationOverlay:setInteractive";
export const DICTATION_OVERLAY_SET_HIT_REGION =
  "forge:dictationOverlay:setHitRegion";

// Voice activity: the running live-voice session, as the companion surface
// renders it. The session's window publishes; the surface's window presses.
export const VOICE_ACTIVITY_START = "forge:voiceActivity:start";
export const VOICE_ACTIVITY_UPDATE = "forge:voiceActivity:update";
export const VOICE_ACTIVITY_END = "forge:voiceActivity:end";
export const VOICE_ACTIVITY_CONTROL = "forge:voiceActivity:control";
export const VOICE_ACTIVITY_CONTROL_EVENT = "forge:voiceActivity:controlEvent";

// Companion surface: the always-present floating avatar
export const COMPANION_GET_STATE = "forge:companion:getState";
export const COMPANION_STATE_EVENT = "forge:companion:state";
export const COMPANION_SET_INTERACTIVE = "forge:companion:setInteractive";
export const COMPANION_MOVE_BY = "forge:companion:moveBy";
export const COMPANION_START_VOICE = "forge:companion:startVoice";
export const COMPANION_TOGGLE_WATCH = "forge:companion:toggleWatch";
export const COMPANION_ANSWER_WATCH_RETRO = "forge:companion:answerWatchRetro";
export const COMPANION_ACTIVATE = "forge:companion:activate";
export const COMPANION_SET_CONTEXT = "forge:companion:setContext";
export const COMPANION_ADVANCE_INTRO = "forge:companion:advanceIntro";
export const COMPANION_CONTEXT_MENU = "forge:companion:contextMenu";

// Popout
export const POPOUT_OPEN = "forge:popout:open";

// Auto-update
export const UPDATE_GET_STATE = "forge:update:getState";
export const UPDATE_CHECK = "forge:update:check";
export const UPDATE_INSTALL = "forge:update:install";
export const UPDATE_STATE_EVENT = "forge:update:state";
