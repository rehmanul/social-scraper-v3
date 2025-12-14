// api/instagram.js - Instagram API using Graph API + scraping fallback

import InstagramAPI from '../lib/instagram-official.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

export default async function handler(req, res) {
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed', status: 'error' });
    }

    try {
        const { username, page = 1, 'per-page': perPage = 10, count = 30, own = 'false' } = req.query;

        if (!username) {
            return res.status(400).json({
                error: 'Missing required parameter: username',
                status: 'error'
            });
        }

        const pageNum = parseInt(page);
        const perPageNum = Math.min(parseInt(perPage), 100);
        const countNum = Math.min(parseInt(count), 100);

        console.log(`[Instagram API] Fetching for @${username} (page ${pageNum})`);

        let rawData;

        // If requesting own account, use Graph API
        if (own === 'true') {
            rawData = await InstagramAPI.fetchUserMedia(username, countNum);
        } else {
            // For public profiles, use scraping
            rawData = await InstagramAPI.fetchPublicProfile(username, countNum);
        }

        // Transform response
        const response = InstagramAPI.transformPosts(rawData, username, pageNum, perPageNum);

        res.setHeader('Cache-Control', 's-maxage=120');
        return res.status(200).json(response);

    } catch (error) {
        console.error('[Instagram API] Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            status: 'error'
        });
    }
}
