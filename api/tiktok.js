// api/tiktok.js - TikTok API using FREE parse.bot with fallback

import ParseBot from '../lib/parsebot.js';
import * as TikTokScraper from '../lib/tiktok-scraper.js';

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
        const { username, page = 1, 'per-page': perPage = 10, count = 50 } = req.query;

        if (!username) {
            return res.status(400).json({
                error: 'Missing required parameter: username',
                status: 'error'
            });
        }

        const pageNum = parseInt(page);
        const perPageNum = Math.min(parseInt(perPage), 100);
        const countNum = Math.min(parseInt(count), 100);

        console.log(`[TikTok API] Fetching for @${username} (page ${pageNum})`);

        try {
            // Priority 1: Fetch from parse.bot
            const rawData = await ParseBot.fetchUserVideos(username, countNum);
            const response = ParseBot.transformVideos(rawData, username, pageNum, perPageNum);

            res.setHeader('Cache-Control', 's-maxage=120');
            return res.status(200).json(response);

        } catch (parseBotError) {
            console.error('[TikTok API] ParseBot failed, switching to fallback:', parseBotError.message);

            // Priority 2: Fallback to page scraping
            console.log('[TikTok API] Using page scraper fallback');
            try {
                const scrapedData = await TikTokScraper.fetchUserPosts(username, countNum);
                const response = TikTokScraper.transformScrapedVideos(scrapedData, username, pageNum, perPageNum);

                res.setHeader('Cache-Control', 's-maxage=60');
                return res.status(200).json(response);

            } catch (scraperError) {
                console.error('[TikTok API] Scraper also failed:', scraperError.message);
                throw new Error(`All methods failed. ParseBot: ${parseBotError.message}. Scraper: ${scraperError.message}`);
            }
        }

    } catch (error) {
        console.error('[TikTok API] Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            status: 'error',
            source: 'all_failed'
        });
    }
}
