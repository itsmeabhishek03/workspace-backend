// Centralized key naming so you don't scatter magic strings
export const RKeys = {
  // refresh sessions: one per RT jti
  rtSession: (userId: string, jti: string) => `rt:${userId}:${jti}`,
  // blacklist for access tokens by jti
  atBlock: (jti: string) => `at:block:${jti}`,
  // rate limit per bucket
  rlBucket: (bucket: string) => `rl:${bucket}`,
  // one-time codes (e.g., email verification) by purpose+subject
  otp: (purpose: string, subject: string) => `otp:${purpose}:${subject}`,
};
