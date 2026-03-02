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
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
        result += String.fromCharCode(charCode);
    }
    return "SØ_" + btoa(result); // Prefix to identify encrypted messages
};

export const decryptMessage = (encoded: string): string => {
    if (!encoded || !encoded.startsWith("SØ_")) return encoded;
    try {
        const text = atob(encoded.substring(3));
        let result = "";
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (e) {
        return "DECRYPTION_ERROR";
    }
};
