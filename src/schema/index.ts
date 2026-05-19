/**
 * Schema-Helper Re-Exports — Plan-Phase 1.2.
 * Verwendung:
 *   import { localBusinessSchema, articleSchema } from '@cw/core/schema';
 */
export {
  localBusinessSchema,
  validateLocalBusiness,
  type BusinessType,
  type LocalBusinessInput,
  type LocalBusinessSchema,
  type Address,
  type Geo,
  type OpeningHoursSpec,
} from "./local-business.js";

export { articleSchema, type ArticleInput } from "./article.js";
export { caseStudySchema, type CaseStudyInput } from "./creative-work.js";
export { breadcrumbListSchema, type BreadcrumbItem } from "./breadcrumb-list.js";
export { serviceSchema, type ServiceInput } from "./service.js";
