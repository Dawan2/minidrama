import { writeFileSync } from 'node:fs';

import { buildMinisConfig, serializeMinisConfig } from '../minis-config.js';
import { minisConfigPath } from '../paths.js';

const contents = serializeMinisConfig(buildMinisConfig());
writeFileSync(minisConfigPath, contents, 'utf8');
process.stdout.write(`wrote ${minisConfigPath}\n`);
