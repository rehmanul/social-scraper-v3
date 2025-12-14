// api/stats.js - API Usage Statistics Endpoint

import TwitterAPI from '../lib/twitter-official.js';

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

    const twitterStats = TwitterAPI.getUsageStats();

    const stats = {
        twitter: {
            keys: twitterStats,
            totalRemaining: twitterStats.reduce((sum, k) => sum + k.remaining, 0),
            totalMax: twitterStats.reduce((sum, k) => sum + k.max, 0),
        },
        youtube: {
            method: 'page_scraping',
            quota: 'unlimited',
            note: 'Using ytInitialData parsing - no API limits',
        },
        instagram: {
            method: 'graph_api + scraping',
            note: 'Graph API for own account, scraping for public profiles',
        },
        tiktok: {
            method: 'parse.bot',
            quota: 'unlimited',
            note: 'Using parse.bot free API',
        },
        timestamp: new Date().toISOString(),
    };

    return res.status(200).json(stats);
}
