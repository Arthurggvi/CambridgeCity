export const RELEASE_FLAG_GLOBAL_KEY = "__CAMBRIAN_RELEASE__";

export function isReleaseBuild() {
  try {
    return globalThis?.[RELEASE_FLAG_GLOBAL_KEY] === true;
  } catch {
    return false;
  }
}

