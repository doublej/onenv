export { CliError, validationError } from './lib/errors.js'
export {
  createOrUpdateVar,
  disableVar,
  editVar,
  enableVar,
  exportEnabledValues,
  getNamespaces,
  getNamespaceVars,
  getNamespaceVarsWithValues,
  removeVar,
} from './lib/manager-service.js'
export { getStateFilePath } from './lib/state-store.js'
