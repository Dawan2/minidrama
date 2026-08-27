export {
  ALLOWED_LICENSE_IDS,
  FORBIDDEN_LICENSE_IDS,
  evaluateLicense,
  formatViolation,
  scanPnpmStore,
  violationsFor,
} from './licenses.js';
export type { LicenseEvaluation, LicenseViolation, InstalledPackage } from './licenses.js';

export {
  DOCUMENTED_FLOORS,
  evaluateCoverage,
  parseIstanbulReport,
  parseThresholds,
  parseUnifiedDiff,
} from './coverage.js';
export type { CoverageFloors, GateResult } from './coverage.js';

export { documentedOperations, parseParityTable } from './parity.js';

export {
  BLOCKING_SEVERITIES,
  REQUIRED_SAST_RULE_IDS,
  USAGE as SAST_USAGE,
  buildSemgrepArgv,
  defaultRulesDir,
  evaluateSemgrepJson,
  formatFinding,
  listSourceFiles,
  loadSastRules,
  missingRequiredRuleIds,
  parseSastArgs,
  runSastCheck,
} from './sast.js';
export type { SastCheckArgs, SastFinding, SastRule } from './sast.js';

export {
  REQUIRED_CODEQL_QUERY_USES,
  REQUIRED_CODEQL_SUITE,
  USAGE as CODEQL_USAGE,
  buildAnalyzeArgv,
  buildCreateArgv,
  defaultConfigPath,
  evaluateSarif,
  formatCodeqlFinding,
  parseCodeqlArgs,
  runCodeqlCheck,
} from './codeql.js';
export type { CodeqlCheckArgs, CodeqlFinding, CodeqlRule } from './codeql.js';

export {
  HIGH_FIX_GRACE_MS,
  LOCKFILE_NAME,
  USAGE as SCA_USAGE,
  buildTrivyArgv,
  defaultLockfile,
  formatVulnerability,
  isBlockingVulnerability,
  parseScaArgs,
  parseTrivyResults,
  runScaCheck,
} from './sca.js';
export type { ScaCheckArgs, ScaVulnerability } from './sca.js';

export {
  THINNING_FILE_NAMES,
  USAGE as SECRETS_USAGE,
  buildGitleaksArgv,
  defaultSource,
  formatFinding as formatSecretFinding,
  parseGitleaksReport,
  parseSecretsArgs,
  runSecretsCheck,
} from './secrets.js';
export type { SecretFinding, SecretsCheckArgs } from './secrets.js';
