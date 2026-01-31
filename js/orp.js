/**
 * ORP (Optimal Recognition Point) Calculator
 *
 * The ORP is the letter in a word where the eye naturally focuses
 * for fastest recognition. This is typically around 1/3 into the word.
 */

/**
 * Calculate the ORP index for a word
 * @param {string} word - The word to calculate ORP for
 * @returns {number} - The index of the ORP letter (0-based)
 */
export function calculateORP(word) {
    const len = word.length;

    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
}

/**
 * Split a word into three parts: before ORP, ORP letter, after ORP
 * @param {string} word - The word to split
 * @returns {{before: string, orp: string, after: string}} - The three parts
 */
export function splitAtORP(word) {
    const orpIndex = calculateORP(word);

    return {
        before: word.slice(0, orpIndex),
        orp: word[orpIndex] || '',
        after: word.slice(orpIndex + 1)
    };
}
