/**
 * Known, not-yet-fixed editing bugs, by id, with a one-line description.
 *
 * Flag a case with `bug: '<id>'` to record a bug before fixing it: the case must keep
 * failing, and once a fix makes it pass the runner asks for the flag to be removed.
 * Empty when every known bug is fixed.
 */
export const KNOWN_BUGS: Record<string, string> = {};
