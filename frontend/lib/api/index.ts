// Re-export all API clients
export { api } from './client';
export { authApi } from './auth';
export { agentsApi } from './agents';
export { costsApi } from './costs';
export { metricsApi } from './metrics';
export { logsApi } from './logs';
export { codeApi } from './code';
export { githubApi } from './github';
export { projectsApi } from './projects';

// Re-export all types
export * from './types';

// Legacy exports for backward compatibility
import { api } from './client';
export { api };