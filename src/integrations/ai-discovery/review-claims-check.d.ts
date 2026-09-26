export type ReviewClaimIssueType =
  | 'unverified_genuine_claim'
  | 'missing_review_disclaimer'
  | 'self_serving_aggregate_rating';

export interface ReviewClaimIssue {
  type: ReviewClaimIssueType;
  details: string;
}

export function checkReviewClaims(html: string, pagePath?: string): ReviewClaimIssue[];
