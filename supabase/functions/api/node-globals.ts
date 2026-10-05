// The shared server code reads configuration from process.env, as it does under
// Node. Make sure the global exists before any of that code is evaluated: this
// module is imported first by index.ts, and ES modules evaluate in import order.
import process from 'node:process'

if (!('process' in globalThis)) {
  ;(globalThis as { process?: typeof process }).process = process
}
