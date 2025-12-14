// lib/twitter-scraper.js - FREE Twitter/X scraper using Nitter instances
// No login required - uses public Nitter mirrors

import axios from 'axios';

// Nitter instances (public Twitter frontend mirrors)
const NITTER_INSTANCES = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.woodland.cafe',
    'https://nitter.1d4.us',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Fetch user tweets from Twitter via Nitter (FREE)
 */
export async function fetchUserTweets(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Twitter Scraper] Fetching tweets for @${cleanUsername}`);

    // Try each Nitter instance
    for (const instance of NITTER_INSTANCES) {
        try {
            const url = `${instance}/${cleanUsername}`;
            console.log(`[Twitter Scraper] Trying ${instance}...`);

            const response = await axios.get(url, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 15000,
            });

            const html = response.data;
            const tweets = parseNitterTweets(html, cleanUsername);

            if (tweets.length > 0) {
                console.log(`[Twitter Scraper] Found ${tweets.length} tweets via ${instance}`);
                return { tweets: tweets.slice(0, count), source: instance };
            }
        } catch (error) {
            console.log(`[Twitter Scraper] ${instance} failed: ${error.message}`);
            continue;
        }
    }

    // Fallback: Try direct Twitter parsing
    try {
        return await fetchFromTwitterDirect(cleanUsername, count);
    } catch (error) {
        console.log(`[Twitter Scraper] Direct fetch failed: ${error.message}`);
    }

    return { tweets: [], error: 'All sources failed' };
}

/**
 * Parse tweets from Nitter HTML
 */
function parseNitterTweets(html, username) {
    const tweets = [];

    // Match tweet items
    const tweetPattern = /<div class="timeline-item[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const contentPattern = /<div class="tweet-content[^"]*">([\s\S]*?)<\/div>/;
    const statsPattern = /<span class="tweet-stat"[^>]*>.*?<span class="icon-(\w+)"[^>]*><\/span>\s*(\d[\d,KMB]*)/g;
    const datePattern = /<span class="tweet-date"[^>]*><a[^>]*title="([^"]+)"/;
    const linkPattern = /<a class="tweet-link"[^>]*href="([^"]+)"/;

    let match;
    while ((match = tweetPattern.exec(html)) !== null) {
        const tweetHtml = match[1];

        // Extract content
        const contentMatch = contentPattern.exec(tweetHtml);
        const content = contentMatch
            ? contentMatch[1].replace(/<[^>]+>/g, '').trim()
            : '';

        // Extract stats
        let likes = 0, retweets = 0, replies = 0;
        let statsMatch;
        while ((statsMatch = statsPattern.exec(tweetHtml)) !== null) {
            const value = parseCount(statsMatch[2]);
            if (statsMatch[1] === 'heart') likes = value;
            if (statsMatch[1] === 'retweet') retweets = value;
            if (statsMatch[1] === 'comment') replies = value;
        }

        // Extract date
        const dateMatch = datePattern.exec(tweetHtml);
        const date = dateMatch ? dateMatch[1] : '';

        // Extract link
        const linkMatch = linkPattern.exec(tweetHtml);
        const tweetId = linkMatch ? linkMatch[1].split('/').pop()?.replace('#m', '') : '';

        if (content) {
            tweets.push({
                tweet_id: tweetId,
                text: content,
                likes,
                retweets,
                replies,
                date,
                url: `https://twitter.com/${username}/status/${tweetId}`,
            });
        }
    }

    return tweets;
}

/**
 * Try direct Twitter page (limited success)
 */
async function fetchFromTwitterDirect(username, count) {
    const url = `https://twitter.com/${username}`;

    const response = await axios.get(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html',
        },
        timeout: 15000,
    });

    // Twitter heavily relies on JS, this is a fallback
    const html = response.data;

    // Try to extract any embedded tweet data
    const dataMatch = html.match(/"legacy":\s*({[^}]+})/g);

    return { tweets: [], source: 'twitter-direct-limited' };
}

function parseCount(str) {
    if (!str) return 0;
    const clean = str.replace(/,/g, '').toUpperCase();
    if (clean.includes('K')) return parseFloat(clean) * 1000;
    if (clean.includes('M')) return parseFloat(clean) * 1000000;
    if (clean.includes('B')) return parseFloat(clean) * 1000000000;
    return parseInt(clean) || 0;
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
            status: rawData?.error ? 'partial' : 'success',
            error: rawData?.error,
        };
    }

    const transformed = tweets.map(t => ({
        tweet_id: t.tweet_id,
        url: t.url,
        description: t.text,
        views: 0, // Not available from Nitter
        likes: t.likes,
        comments: t.replies,
        shares: t.retweets,
        created_at: t.date,
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
        },
        data: paginated,
        status: 'success'
    };
}

export default { fetchUserTweets, transformTweets };
