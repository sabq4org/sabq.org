/**
 * iFox AI Management System Services
 * 
 * Barrel export file for all iFox AI Management System services.
 * 
 * Configuration Module:
 * - Preferences Service: AI configuration management
 * - Templates Service: Content template management
 * - Workflows Service: Automated workflow management
 * 
 * Intelligence Module:
 * - Quality Service: AI-powered content quality checking
 * - Strategy Service: AI-powered content strategy recommendations
 * 
 * Operations Module:
 * - Calendar Service: Editorial calendar management
 * - Performance Service: Content performance tracking
 * - Budget Service: API budget tracking and monitoring
 */

// Configuration Module
export { ifoxPreferencesService, IfoxPreferencesService } from './preferencesService';
export { ifoxTemplatesService, IfoxTemplatesService } from './templatesService';
export { ifoxWorkflowsService, IfoxWorkflowsService } from './workflowsService';

// Intelligence Module
export { ifoxQualityService, IfoxQualityService } from './qualityService';
export { ifoxStrategyService, IfoxStrategyService } from './strategyService';

// Operations Module
export { ifoxCalendarService, IfoxCalendarService } from './calendarService';
export { ifoxPerformanceService, IfoxPerformanceService } from './performanceService';
export { ifoxBudgetService, IfoxBudgetService } from './budgetService';
