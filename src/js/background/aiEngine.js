import { log, debug, warn } from '../shared/logger.js';

// --- Configuration for Heuristic Scoring ---
const HEURISTIC_WEIGHTS = {
    URL_LENGTH_SUSPICIOUS: 0.1,
    HOSTNAME_LENGTH_SUSPICIOUS: 0.1,
    IP_AS_HOSTNAME: 0.8, // High weight if IP is used
    SUBDOMAIN_DEPTH_SUSPICIOUS: 0.2,
    PATH_DEPTH_SUSPICIOUS: 0.1,
    SUSPICIOUS_KEYWORD_SCORE: 0.3, // Base weight, can be amplified by number of keywords
    NON_STANDARD_TLD: 0.15,
    EXCESSIVE_HYPHENS_HOSTNAME: 0.1,
    PRESENCE_OF_AT_SYMBOL: 0.5, // Often an indicator of obfuscation attempts
    SUSPICIOUS_FILE_EXTENSION: 0.4, // New: For .exe, .zip, .scr etc. in path
    FREE_HOSTING_PLATFORM: 0.25,  // New: For sites on weebly, blogspot etc.
};

const URL_LENGTH_THRESHOLD = 75; // URLs longer than this are considered somewhat suspicious
const HOSTNAME_LENGTH_THRESHOLD = 25; // Hostnames longer than this
const SUBDOMAIN_DEPTH_THRESHOLD = 4; // More than 4 dots (e.g., a.b.c.d.example.com)
const PATH_DEPTH_THRESHOLD = 5; // More than 5 slashes in the path
const HYPHEN_COUNT_THRESHOLD = 3; // More than 3 hyphens in hostname

const SUSPICIOUS_KEYWORDS = [
    'login', 'signin', 'verify', 'account', 'update', 'secure', 'support',
    'confirm', 'password', 'banking', 'credential', 'activity', 'alert',
    'invoice', 'payment', 'recover', 'unlock', 'limited', 'admin', 'portal'
];

const COMMON_TLDS = new Set([
    '.com', '.org', '.net', '.edu', '.gov', '.uk', '.de', '.jp', '.fr', '.au', '.us',
    '.ca', '.cn', '.info', '.io', '.co', '.ru', '.br', '.xyz', '.top', '.site', '.online'
]);

const FREE_HOSTING_KEYWORDS = new Set([
    'weebly', 'blogspot', 'wix', 'wordpress.com', 'sites.google.com', 'godaddysites',
    '000webhost', 'netlify.app', 'firebaseapp.com', 'github.io', 'gitlab.io',
    'surge.sh', 'glitch.me', 'carrd.co'
]);

const SUSPICIOUS_EXTENSIONS = new Set([
    '.exe', '.zip', '.rar', '.msi', '.dmg', '.scr', '.bat', '.cmd', '.js'
]);

/**
 * Extracts various features from a URL and its components.
 * @param {URL} urlObject - The URL object to analyze.
 * @returns {object} An object containing extracted features.
 */
function extractUrlFeatures(urlObject) {
    const features = {
        urlLength: urlObject.href.length,
        hostname: urlObject.hostname,
        hostnameLength: urlObject.hostname.length,
        pathname: urlObject.pathname,
        pathLength: urlObject.pathname.length,
        search: urlObject.search,
        protocol: urlObject.protocol,
        isIpHostname: /^[0-9.]+$/.test(urlObject.hostname),
        subdomainDepth: urlObject.hostname.split('.').length,
        pathDepth: urlObject.pathname.split('/').filter(p => p.length > 0).length,
        hyphenCountInHostname: (urlObject.hostname.match(/-/g) || []).length,
        hasAtSymbol: urlObject.href.includes('@') && urlObject.username === '',
        keywordsFound: [],
        tld: '',
        hasSuspiciousExtension: false,
        isOnFreeHostingPlatform: false
    };

    const hostnameParts = urlObject.hostname.split('.');
    if (hostnameParts.length >= 2) {
        features.tld = '.' + hostnameParts[hostnameParts.length - 1];
    } else if (hostnameParts.length === 1 && !features.isIpHostname) {
        features.tld = '.' + hostnameParts[0];
    }

    const lowerHref = urlObject.href.toLowerCase();
    SUSPICIOUS_KEYWORDS.forEach(keyword => {
        if (lowerHref.includes(keyword)) {
            features.keywordsFound.push(keyword);
        }
    });

    const lowerPathname = features.pathname.toLowerCase();
    for (const ext of SUSPICIOUS_EXTENSIONS) {
        if (lowerPathname.endsWith(ext)) {
            features.hasSuspiciousExtension = true;
            break;
        }
    }

    const lowerHostname = features.hostname.toLowerCase();
    for (const platformKeyword of FREE_HOSTING_KEYWORDS) {
        if (lowerHostname.includes(platformKeyword)) {
            features.isOnFreeHostingPlatform = true;
            break;
        }
    }
    return features;
}

/**
 * Analyzes a URL locally using heuristic-based feature extraction.
 * @param {string} urlString - The URL string to analyze.
 * @returns {object} An object containing the heuristic score and contributing features.
 */
export function analyzeUrlLocally(urlString) {
    debug(`(AIEngine) Analyzing URL locally: ${urlString}`);
    let heuristicScore = 0;
    const contributingFactors = {};
    let urlObject;

    try {
        urlObject = new URL(urlString);
    } catch (e) {
        warn(`(AIEngine) Invalid URL string: ${urlString}`, e);
        return { score: 0, details: { errorReason: 'Invalid URL format' }, error: 'Invalid URL' };
    }

    const features = extractUrlFeatures(urlObject);
    contributingFactors.rawFeatures = features;

    if (features.isIpHostname) {
        heuristicScore += HEURISTIC_WEIGHTS.IP_AS_HOSTNAME;
        contributingFactors.ipAsHostname = true;
    }
    if (features.urlLength > URL_LENGTH_THRESHOLD) {
        heuristicScore += HEURISTIC_WEIGHTS.URL_LENGTH_SUSPICIOUS;
        contributingFactors.longUrl = true;
    }
    if (features.hostnameLength > HOSTNAME_LENGTH_THRESHOLD) {
        heuristicScore += HEURISTIC_WEIGHTS.HOSTNAME_LENGTH_SUSPICIOUS;
        contributingFactors.longHostname = true;
    }
    if (features.subdomainDepth > SUBDOMAIN_DEPTH_THRESHOLD && !features.isIpHostname) {
        heuristicScore += HEURISTIC_WEIGHTS.SUBDOMAIN_DEPTH_SUSPICIOUS * (features.subdomainDepth - SUBDOMAIN_DEPTH_THRESHOLD);
        contributingFactors.deepSubdomains = features.subdomainDepth;
    }
    if (features.pathDepth > PATH_DEPTH_THRESHOLD) {
        heuristicScore += HEURISTIC_WEIGHTS.PATH_DEPTH_SUSPICIOUS;
        contributingFactors.deepPath = features.pathDepth;
    }
    if (features.keywordsFound.length > 0) {
        const keywordImpact = Math.min(features.keywordsFound.length / 3, 1);
        heuristicScore += HEURISTIC_WEIGHTS.SUSPICIOUS_KEYWORD_SCORE * (1 + keywordImpact);
        contributingFactors.suspiciousKeywords = features.keywordsFound;
    }
    if (!features.isIpHostname && features.tld && !COMMON_TLDS.has(features.tld.toLowerCase())) {
        heuristicScore += HEURISTIC_WEIGHTS.NON_STANDARD_TLD;
        contributingFactors.nonStandardTld = features.tld;
    }
    if (features.hyphenCountInHostname > HYPHEN_COUNT_THRESHOLD && !features.isIpHostname) {
        heuristicScore += HEURISTIC_WEIGHTS.EXCESSIVE_HYPHENS_HOSTNAME;
        contributingFactors.excessiveHyphens = features.hyphenCountInHostname;
    }
    if (features.hasAtSymbol) {
        heuristicScore += HEURISTIC_WEIGHTS.PRESENCE_OF_AT_SYMBOL;
        contributingFactors.atSymbolInPath = true;
    }
    if (features.hasSuspiciousExtension) {
        heuristicScore += HEURISTIC_WEIGHTS.SUSPICIOUS_FILE_EXTENSION;
        contributingFactors.suspiciousFileExtension = features.pathname.substring(features.pathname.lastIndexOf('.'));
    }
    if (features.isOnFreeHostingPlatform) {
        heuristicScore += HEURISTIC_WEIGHTS.FREE_HOSTING_PLATFORM;
        contributingFactors.freeHostingPlatformUsed = true;
    }

    const finalScore = Math.min(Math.max(heuristicScore, 0), 1);
    log(`(AIEngine) URL: ${urlString}, Heuristic Score: ${finalScore.toFixed(3)}`, contributingFactors);
    return {
        score: finalScore,
        details: contributingFactors,
        error: null
    };
}

// More comprehensive list of suspicious patterns for NLP
const NLP_PATTERNS = {
    urgency: {
        weight: 0.35,
        regex: /\b(urgent!|act now|limited time|immediate action|final notice|expires soon|don't delay|last chance|warning!)\b/ig,
        keywords: []
    },
    prize_winning: {
        weight: 0.4, // Higher weight as these are often scammy
        regex: /\b(you have won|winner!|congratulations.*prize|claim your reward|selected as a winner|guaranteed winner|free gift)\b/ig,
        keywords: []
    },
    account_verification: { // Often used for phishing
        weight: 0.4,
        regex: /\b(verify your account|confirm your details|validate your information|secure your login|update your credentials|account locked|suspicious login|unusual activity detected|account security|login attempt failed)\b/ig,
        keywords: []
    },
    authority_impersonation: {
        weight: 0.25,
        regex: /\b(official notice|government warning|tax refund|legal action|court summons|law enforcement|bank security team|customer support|technical support)\b/ig,
        keywords: []
    },
    scare_tactics: {
        weight: 0.3,
        regex: /\b(account suspended|security alert|system compromised|virus detected|malware found|immediate threat|data breach)\b/ig,
        keywords: []
    },
    investment_scams: { // Common in crypto/forex scams
        weight: 0.2,
        regex: /\b(guaranteed profit|high return|risk-free investment|double your money|get rich quick|investment opportunity|exclusive offer)\b/ig,
        keywords: []
    }
};

const NLP_SCORE_CAP_PER_CATEGORY = 0.5; // Max score a single category can contribute before weighting
const MAX_MATCHES_PER_CATEGORY_TO_CONSIDER = 5; // To prevent excessive scoring from one keyword repeated many times

/**
 * Analyzes page content for scam-related language patterns.
 * @param {string} textContent - The text content of the page.
 * @returns {object} An object containing NLP analysis results (e.g., score, keywordsFound).
 */
export async function analyzePageContentLocally(textContent) {
    if (!textContent || textContent.trim().length < 100) { // Basic guard: require some text
        debug("(AIEngine) NLP: Not enough text content for analysis (", textContent?.length || 0, " chars).");
        return { score: 0, details: { reason: "Insufficient text" }, error: null };
    }

    debug(`(AIEngine) NLP analysis started. Content length: ${textContent.length}`);
    
    let nlpScore = 0;
    const nlpDetails = {
        matchedCategories: {},
        totalMatches: 0
    };

    const lowerTextContent = textContent.toLowerCase();

    // Reset keywords arrays for each call (if NLP_PATTERNS is a global const and modified)
    for (const category in NLP_PATTERNS) {
        NLP_PATTERNS[category].keywords = [];
    }

    for (const category in NLP_PATTERNS) {
        const patternInfo = NLP_PATTERNS[category];
        let categoryScore = 0;
        let matchesFoundThisCategory = 0;

        const matches = lowerTextContent.matchAll(patternInfo.regex);
        for (const match of matches) {
            if (match[0]) {
                patternInfo.keywords.push(match[0].trim());
                matchesFoundThisCategory++;
                if (matchesFoundThisCategory >= MAX_MATCHES_PER_CATEGORY_TO_CONSIDER) {
                    break; // Stop counting matches for this category if too many, to avoid over-inflation
                }
            }
        }

        if (matchesFoundThisCategory > 0) {
            // Simple scoring: base increment per match, capped per category before applying weight
            categoryScore = Math.min(matchesFoundThisCategory * 0.15, NLP_SCORE_CAP_PER_CATEGORY); 
            nlpScore += categoryScore * patternInfo.weight;
            nlpDetails.matchedCategories[category] = {
                count: matchesFoundThisCategory,
                keywords: [...new Set(patternInfo.keywords)], // Unique keywords
                categoryScore: categoryScore,
                weightedScore: categoryScore * patternInfo.weight
            };
            nlpDetails.totalMatches += matchesFoundThisCategory;
        }
    }
    
    // Normalize final NLP score to be between 0 and 1
    // The sum of weights can exceed 1, so cap the raw score if needed.
    // E.g. if all categories hit their cap and weights are high.
    // For now, individual contributions are weighted, so direct sum might be fine and then capped.
    const finalNlpScore = Math.min(nlpScore, 1.0);

    if (finalNlpScore > 0) {
      log(`(AIEngine) NLP Content Analysis: Score=${finalNlpScore.toFixed(3)}`, nlpDetails);
    }

    return {
        score: finalNlpScore,
        details: nlpDetails, 
        error: null // No specific error unless an exception occurs during processing
    };
} 