// lib/twitter-scraper.js - Wrapper for Twitter API v2
// Previously tried Nitter, now using Official API as primary

import { fetchUserTweets as fetchOfficial, transformTweets as transformOfficial } from './twitter-official.js';

export async function fetchUserTweets(username, count = 30) {
    console.log(`[Twitter Scraper] Using Official API for @${username}`);
    return await fetchOfficial(username, count);
}

export const transformTweets = transformOfficial;

export default { fetchUserTweets, transformTweets };
