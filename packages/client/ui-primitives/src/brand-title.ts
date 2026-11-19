/**
 * Localized product title for a personal-fork build.
 *
 * FORK MODIFICATION (personal fork): a build bakes `DSH_CLIENT_TITLE` and the
 * optional localized variants `DSH_CLIENT_TITLE_RU` and `DSH_CLIENT_TITLE_ZH`
 * as build-time values. The locale plugin writes `document.documentElement.lang`
 * before notifying its subscribers, so a locale switch — which hands out new
 * `t` functions and re-renders consumers — reseeds this selection at render.
 */

/**
 * Select the build-baked brand title for the document language.
 * @param fallback - localized generic label to use when no title is baked.
 * @returns the language-specific baked title, else the baked default, else the fallback.
 */
export function localizedBrandTitle(fallback: string): string {
  const language = document.documentElement.lang
  const localized =
    language.startsWith('ru') ? process.env.DSH_CLIENT_TITLE_RU
      : language.startsWith('zh') ? process.env.DSH_CLIENT_TITLE_ZH
      : undefined
  return localized ?? process.env.DSH_CLIENT_TITLE ?? fallback
}
