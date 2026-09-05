/* Copy this file to config.js and paste your key in.
 * config.js is git-ignored, so your real key never reaches the repository.
 *
 * Get a key: https://aistudio.google.com/apikey
 *
 * SECURITY: this app runs entirely in the browser, so any key placed here is
 * visible to anyone who opens the page or its DevTools. Use a throwaway or
 * restricted key for demos, and never ship this pattern to production - a
 * production build proxies the call through a server that holds the key.
 *
 * With no key set the app still runs: agent.js falls back to a local
 * rule-based controller and labels those decisions HEURISTIC.
 */
window.CONFIG = {
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-3.6-flash'
};
