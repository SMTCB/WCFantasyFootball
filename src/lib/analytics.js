/**
 * track(event, props): the one place product events go through.
 * Today it only logs to the console. Storing events (a table, or Plausible/PostHog)
 * is waiting on an owner decision (CODE-5), so swapping the body here is the only change needed.
 */
export function track(event, props = {}) {
  console.info('[event]', event, props);
}
