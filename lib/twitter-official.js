// lib/twitter-official.js - Twitter/X API v2 Client
import { TwitterApi } from 'twitter-api-v2';

// Credentials from environment variables
const credentials = {
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
};

// Initialize client
// Only initialize if keys are present to avoid immediate crash on load
let client = null;
let roClient = null;

if (credentials.appKey && credentials.appSecret) {
    client = new TwitterApi(credentials);
    roClient = client.readOnly;
}

/**
 * Fetch user tweets using Twitter API v2
 * @param {string} username - Twitter username (without @)
 * @param {number} count - Number of tweets to fetch (default 30)
 * @returns {Promise<object>} - Tweets data
 */
export async function fetchUserTweets(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Twitter API] Fetching tweets for @${cleanUsername}`);

    if (!roClient) {
        console.error('[Twitter API] Missing credentials. Set TWITTER_API_KEY, TWITTER_API_SECRET, etc.');
        return { tweets: [], error: 'Missing Twitter API credentials' };
    }

    try {
        // 1. Get User ID
        const user = await roClient.v2.userByUsername(cleanUsername);
        if (!user.data) {
            throw new Error(`User @${cleanUsername} not found`);
        }
        const userId = user.data.id;

        // 2. Get User Timeline
        const timeline = await roClient.v2.userTimeline(userId, {
            max_results: Math.min(count, 100), // API limit is 100
            'tweet.fields': ['created_at', 'public_metrics', 'entities', 'attachments'],
            'media.fields': ['url', 'preview_image_url', 'type'],
            'expansions': ['attachments.media_keys'],
            exclude: ['replies', 'retweets']
        });

        const tweets = timeline.data.data || [];
        const includes = timeline.data.includes || {};

        console.log(`[Twitter API] Retrieved ${tweets.length} tweets`);

        // Helper to find media
        const getMedia = (mediaKeys) => {
            if (!mediaKeys || !includes.media) return [];
            return mediaKeys.map(key => includes.media.find(m => m.media_key === key)).filter(Boolean);
        };

        const parsedTweets = tweets.map(tweet => {
            const media = getMedia(tweet.attachments?.media_keys);
            const mediaUrls = media.map(m => m.url || m.preview_image_url).filter(Boolean);

            return {
                tweet_id: tweet.id,
                text: tweet.text,
                likes: tweet.public_metrics?.like_count || 0,
                retweets: tweet.public_metrics?.retweet_count || 0,
                replies: tweet.public_metrics?.reply_count || 0,
                views: tweet.public_metrics?.impression_count || 0,
                date: tweet.created_at,
                url: `https://twitter.com/${cleanUsername}/status/${tweet.id}`,
                media: mediaUrls
            };
        });

        return { tweets: parsedTweets, source: 'twitter-api-v2' };

    } catch (error) {
        console.error(`[Twitter API] Error:`, error.message);
        // Handle rate limits or other specific errors if needed
        return { tweets: [], error: error.message };
    }
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
        views: t.views,
        likes: t.likes,
        comments: t.replies,
        shares: t.retweets,
        created_at: t.date,
        cover_image: t.media[0] || '', // Use first image as cover
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
