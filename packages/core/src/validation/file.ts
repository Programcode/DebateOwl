/**
 * File upload validation utilities
 * Enforces size limits, file count, and allowed MIME types
 */

// Maximum file size in bytes (10 MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Maximum number of files
export const MAX_FILE_COUNT = 5;

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
    // Text files
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/xml',
    // Code files
    'application/json',
    'application/xml',
    'application/javascript',
    'text/javascript',
    'application/typescript',
    // Application-specific text
    'application/x-yaml',
    'text/yaml',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-c++',
]);

// Allowed file extensions (lowercase, without dot)
const ALLOWED_EXTENSIONS = new Set([
    // Text
    'txt', 'md', 'markdown', 'csv', 'json', 'yaml', 'yml', 'xml',
    // Code
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
    // Web
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    // Config
    'toml', 'ini', 'cfg', 'conf', 'env',
]);

/** The fields validation reads; a browser File satisfies it. */
export interface FileLike {
    name: string;
    size: number;
    type: string;
}

export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validates a single file for size and type.
 */
export function validateSingleFile(file: FileLike): FileValidationResult {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            error: `File "${file.name}" is too large (${sizeMB} MB). Maximum size is 10 MB.`,
        };
    }

    // Get file extension
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    // Check if extension is allowed
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        return {
            valid: false,
            error: `File "${file.name}" has an unsupported file type. Only text and code files are allowed.`,
        };
    }

    // Check MIME type if available (some browsers don't provide it)
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith('text/')) {
        return {
            valid: false,
            error: `File "${file.name}" has an unsupported file type. Only text and code files are allowed.`,
        };
    }

    return { valid: true };
}

/**
 * Validates an array of files for upload.
 * Checks: file count, individual file sizes, and allowed types.
 */
export function validateFileUpload(files: FileLike[]): FileValidationResult {
    // Check file count
    if (files.length > MAX_FILE_COUNT) {
        return {
            valid: false,
            error: `Too many files selected (${files.length}). Maximum is ${MAX_FILE_COUNT} files.`,
        };
    }

    // Validate each file
    for (const file of files) {
        const result = validateSingleFile(file);
        if (!result.valid) {
            return result;
        }
    }

    return { valid: true };
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
