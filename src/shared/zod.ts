import { config } from 'zod'

/**
 * zod, told not to ask whether it may build code from strings.
 *
 * To parse objects faster it tries `new Function` once, when the first schema is made. The dashboard's CSP
 * refuses that, and though zod catches the refusal, the browser reports the asking: an error in the console on
 * every load of the dashboard. With `jitless` it never asks. Nothing gets slower where it runs for people:
 * the dashboard's CSP and the Workers runtime both refuse, so neither ever parsed that way.
 *
 * The setting has to be made before the first schema is, wherever a bundler puts that. So every schema is made
 * with the `z` from here, never with zod's own: a module that needs `z` has run this one first.
 * tests/shared.test.ts holds both.
 */
config({ jitless: true })

export { z } from 'zod'
