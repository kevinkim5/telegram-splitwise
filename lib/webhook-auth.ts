export function verifyWebhookSecret(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined,
): boolean {
  // If no secret is configured (local dev), allow all requests
  if (!expectedSecret) return true
  if (!headerValue) return false
  return headerValue === expectedSecret
}
