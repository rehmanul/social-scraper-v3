// api/tiktok-video.js - TikTok Video Details API

import * as TikTokScraper from '../lib/tiktok-scraper.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

function normalizeTiktokUrl(link) {
    if (!link) return null;
    link = link.trim();

    // If it's a numeric ID, construct the URL
    if (/^\d+$/.test(link)) {
        return `https://www.tiktok.com/@/video/${link}`;
    }

    if (link.startsWith('http')) {
        return link;
    }

    // Prepend https:// if missing
    return `https://${link}`;
}

export default async function handler(req, res) {
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed', status: 'error' });
    }

    try {
        let { link } = req.query;

        if (!link) {
            return res.status(400).json({
                error: 'Missing required parameter: link',
                status: 'error'
            });
        }

        // Handle if link is array
        if (Array.isArray(link)) {
            link = link.join(',');
        }

        const links = link.split(',').map(l => normalizeTiktokUrl(l)).filter(l => l);

        if (links.length === 0) {
            return res.status(400).json({
                error: 'No valid links provided',
                status: 'error'
            });
        }

        console.log(`[TikTok Video API] Fetching details for ${links.length} links`);

        // Batch requests to avoid rate limits
        const videos = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < links.length; i += BATCH_SIZE) {
            const batch = links.slice(i, i + BATCH_SIZE);
            const promises = batch.map(l => TikTokScraper.fetchVideo(l));
            const results = await Promise.all(promises);
            videos.push(...results.filter(v => v !== null));

            // Small delay between batches if not last batch
            if (i + BATCH_SIZE < links.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return res.status(200).json({
            data: videos,
            meta: {
                total_requested: links.length,
                total_found: videos.length,
            },
            status: 'success'
        });

    } catch (error) {
        console.error('[TikTok Video API] Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            status: 'error'
        });
    }
}
