/**
 * INTERNAL SECTOR_ONE CRYPTO UTILITY
 * For obfuscating data in transit and at rest.
 */

const SECRET_KEY = "SECTOR_ONE_HACKER_KEY_2024";

/**
 * Simple XOR cipher for demonstration/theme purposes.
 * For production apps, use Web Crypto API (AES-GCM).
 */
export const encryptMessage = (text: string): string => {
    if (!text) return "";

    // 1. Convert string to UTF-8 bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    // 2. XOR each byte
    const keyBytes = encoder.encode(SECRET_KEY);
    const resultBytes = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        resultBytes[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }

    // 3. Convert to Base64 safely
    const binary = Array.from(resultBytes).map(b => String.fromCharCode(b)).join('');
    return "SØ_" + btoa(binary);
};

export const decryptMessage = (encoded: string): string => {
    if (!encoded || !encoded.startsWith("SØ_")) return encoded;
    try {
        // 1. Decode Base64 to binary string
        const binary = atob(encoded.substring(3));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        // 2. XOR each byte
        const encoder = new TextEncoder();
        const keyBytes = encoder.encode(SECRET_KEY);
        const resultBytes = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            resultBytes[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
        }

        // 3. Convert bytes back to UTF-8 string
        const decoder = new TextDecoder();
        return decoder.decode(resultBytes);
    } catch (e) {
        console.error("Decryption error:", e);
        return "DECRYPTION_ERROR";
    }
};
