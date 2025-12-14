// lib/twitter-official.js - Twitter Official API with Multi-Key Rotation + Nitter Fallback
// Uses multiple API keys to multiply the free tier quota (100 posts x N keys)

import axios from 'axios';

// Twitter API Keys from environment variables
const BEARER_TOKENS = [
    process.env.TWITTER_BEARER_TOKEN_1,
    process.env.TWITTER_BEARER_TOKEN_2,
    process.env.TWITTER_BEARER_TOKEN_3,
    process.env.TWITTER_BEARER_TOKEN_4,
    process.env.TWITTER_BEARER_TOKEN_5,
].filter(Boolean);

// Build API_KEYS array from environment
const API_KEYS = BEARER_TOKENS.map((token, i) => ({
    name: `key_${i + 1}`,
    bearerToken: token,
    usageCount: 0,
    maxPerMonth: 100,
    exhausted: false,
}));

// Fallback if no env vars set (for local testing)
if (API_KEYS.length === 0) {
    console.warn('[Twitter] No API keys configured. Set TWITTER_BEARER_TOKEN_1, etc.');
}

// Nitter instances for fallback
const NITTER_INSTANCES = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
];

let currentKeyIndex = 0;
let allKeysExhausted = false;

/**
 * Get next available API key
 */
function getNextKey() {
    if (API_KEYS.length === 0) return null;

    for (let i = 0; i < API_KEYS.length; i++) {
        const idx = (currentKeyIndex + i) % API_KEYS.length;
        if (!API_KEYS[idx].exhausted && API_KEYS[idx].usageCount < API_KEYS[idx].maxPerMonth) {
            currentKeyIndex = (idx + 1) % API_KEYS.length;
            return API_KEYS[idx];
        }
    }
    allKeysExhausted = true;
    return null;
}

/**
 * Fetch tweets using Official API, fallback to Nitter
 */
export async function fetchUserTweets(username, count = 10) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Twitter Official API] Fetching tweets for @${cleanUsername}`);

    // Try official API first
    const key = getNextKey();

    if (key && !allKeysExhausted) {
        console.log(`[Twitter Official API] Using key: ${key.name} (${key.usageCount}/${key.maxPerMonth})`);

        try {
            const result = await fetchFromOfficialAPI(cleanUsername, count, key);
            if (result.tweets.length > 0) {
                return result;
            }
        } catch (error) {
            console.log(`[Twitter Official API] Failed: ${error.message}`);
            if (error.message.includes('429') || error.message.includes('Too Many')) {
                key.exhausted = true;
            }
        }
    }

    // Fallback to Nitter
    console.log(`[Twitter] Falling back to Nitter scraping`);
    return await fetchFromNitter(cleanUsername, count);
}

/**
 * Fetch from Official Twitter API v2
 */
async function fetchFromOfficialAPI(username, count, key) {
    // Get user ID
    const userResponse = await axios.get(
        `https://api.twitter.com/2/users/by/username/${username}`,
        {
            headers: { 'Authorization': `Bearer ${decodeURIComponent(key.bearerToken)}` },
            timeout: 30000,
        }
    );

    if (!userResponse.data?.data?.id) {
        throw new Error('User not found');
    }

    const userId = userResponse.data.data.id;

    // Get tweets
    const tweetsResponse = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets`,
        {
            headers: { 'Authorization': `Bearer ${decodeURIComponent(key.bearerToken)}` },
            params: {
                max_results: Math.min(count, 100),
                'tweet.fields': 'created_at,public_metrics',
            },
            timeout: 30000,
        }
    );

    key.usageCount++;

    const tweets = tweetsResponse.data?.data || [];

    return {
        tweets: tweets.map(t => ({
            tweet_id: t.id,
            text: t.text,
            created_at: t.created_at,
            likes: t.public_metrics?.like_count || 0,
            retweets: t.public_metrics?.retweet_count || 0,
            replies: t.public_metrics?.reply_count || 0,
            impressions: t.public_metrics?.impression_count || 0,
        })),
        source: 'official_api',
        quotaRemaining: key.maxPerMonth - key.usageCount,
    };
}

/**
 * Fetch from Nitter (fallback)
 */
async function fetchFromNitter(username, count) {
    for (const instance of NITTER_INSTANCES) {
        try {
            console.log(`[Twitter] Trying Nitter: ${instance}`);

            const response = await axios.get(`${instance}/${username}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000,
            });

            const html = response.data;
            const tweets = parseNitterTweets(html, username);

            if (tweets.length > 0) {
                console.log(`[Twitter] Found ${tweets.length} tweets via Nitter`);
                return { tweets: tweets.slice(0, count), source: 'nitter' };
            }
        } catch (error) {
            console.log(`[Twitter] Nitter ${instance} failed: ${error.message}`);
            continue;
        }
    }

    return { tweets: [], source: 'none', error: 'All sources exhausted' };
}

/**
 * Parse Nitter HTML
 */
function parseNitterTweets(html, username) {
    const tweets = [];
    const contentRegex = /<div class="tweet-content[^"]*">([\s\S]*?)<\/div>/g;

    let match;
    while ((match = contentRegex.exec(html)) !== null && tweets.length < 20) {
        const content = match[1].replace(/<[^>]+>/g, '').trim();
        if (content) {
            tweets.push({
                tweet_id: `nitter_${Date.now()}_${tweets.length}`,
                text: content,
                likes: 0,
                retweets: 0,
                replies: 0,
            });
        }
    }

    return tweets;
}

/**
 * Transform to standard format
 */
export function transformTweets(rawData, username, page = 1, perPage = 10) {
    const requestTime = Math.floor(Date.now() / 1000);
    const tweets = rawData?.tweets || [];

    if (tweets.length === 0) {
        return {
            meta: { username, page, total_pages: 0, total_posts: 0, request_time: requestTime },
            data: [],
            status: 'success',
            source: rawData?.source || 'none',
        };
    }

    const transformed = tweets.map(t => ({
        tweet_id: t.tweet_id,
        url: `https://twitter.com/${username}/status/${t.tweet_id}`,
        description: t.text,
        views: t.impressions || 0,
        likes: t.likes,
        comments: t.replies,
        shares: t.retweets,
        created_at: t.created_at,
    }));

    const totalPosts = transformed.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginated = transformed.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username,
            page,
            total_pages: totalPages,
            total_posts: totalPosts,
            request_time: requestTime,
            source: rawData?.source,
            api_quota_remaining: rawData?.quotaRemaining,
        },
        data: paginated,
        status: 'success'
    };
}

/**
 * Get API usage stats
 */
export function getUsageStats() {
    return API_KEYS.map(k => ({
        name: k.name,
        used: k.usageCount,
        max: k.maxPerMonth,
        remaining: k.maxPerMonth - k.usageCount,
        exhausted: k.exhausted,
    }));
}

export default { fetchUserTweets, transformTweets, getUsageStats };
