/**
 * Regex patterns that identify X Rebirth drop-in mod files (archives meant to
 * be extracted into the game root rather than wrapped under
 * `extensions/<modname>/content.xml`).
 *
 * Also passed to `IGame.details.stopPatterns` so the renderer's `getStopPatterns`
 * helper (`installer_fomod_shared/utils/gameSupport.ts:526`) returns them for
 * any FOMOD-aware installer that might inspect this game in the future.
 */
export const XREBIRTH_STOP_PATTERNS: string[] = [
  // X Rebirth game-data archives.
  "[^/]*\\.cat$",
  "[^/]*\\.dat$",
  // Translation/text files.
  "(^|/)t/[^/]+\\.xml$",
  // Game language data dropped at root.
  "(^|/)lang\\.dat$",
  // Standard X Rebirth mod subfolders containing .xml content.
  "(^|/)assets/.+\\.xml$",
  "(^|/)libraries/.+\\.xml$",
  "(^|/)maps/.+\\.xml$",
  "(^|/)md/.+\\.xml$",
  "(^|/)cinematics/.+",
];
