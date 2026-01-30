/**
 * URL validation utilities
 * Validates URLs to prevent XSS and other security issues
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:']);

/**
 * Validates a URL string and returns a safe URL or undefined.
 * 
 * - Allows only http: and https: protocols
 * - Blocks javascript:, data:, and other dangerous schemes
 * - Uses URL constructor for robust parsing
 * 
 * @param url - The URL string to validate
 * @returns The validated URL string, or undefined if invalid/unsafe
 */
export function validateUrl(url?: string): string | undefined {
    if (!url || typeof url !== 'string') {
        return undefined;
    }

    // Trim whitespace
    const trimmed = url.trim();
    if (!trimmed) {
        return undefined;
    }

    // Handle URLs without protocol (add https:// prefix)
    let urlToValidate = trimmed;
    if (!trimmed.includes('://') && trimmed.includes('.')) {
        urlToValidate = `https://${trimmed}`;
    }

    try {
        const parsed = new URL(urlToValidate);

        // Check for blocked protocols first
        if (BLOCKED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
            console.warn(`[SECURITY] Blocked dangerous URL protocol: ${parsed.protocol}`);
            return undefined;
        }

        // Only allow http and https
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
            console.warn(`[SECURITY] Blocked non-http URL protocol: ${parsed.protocol}`);
            return undefined;
        }

        // Return the normalized URL
        return parsed.href;
    } catch {
        // Invalid URL
        return undefined;
    }
}

/**
 * Checks if a URL is safe without normalizing it.
 * Useful for validation-only scenarios.
 */
export function isUrlSafe(url?: string): boolean {
    return validateUrl(url) !== undefined;
}
