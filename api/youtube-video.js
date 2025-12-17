// api/youtube-video.js - YouTube Video Details API

import YouTubeAPI from '../lib/youtube-official.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

function extractVideoId(link) {
    if (!link) return null;

    // Regular YouTube URL
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = link.match(regExp);
    if (match && match[2].length === 11) {
        return match[2];
    }

    // Shorts URL
    const shortsMatch = link.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch && shortsMatch[1]) {
        return shortsMatch[1];
    }

    // If it looks like an ID, return it (simple check for length 11)
    if (link.length === 11 && /^[a-zA-Z0-9_-]+$/.test(link)) {
        return link;
    }

    return null;
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

        const links = link.split(',');
        const videoIds = links.map(l => extractVideoId(l.trim())).filter(id => id);

        if (videoIds.length === 0) {
            return res.status(400).json({
                error: 'No valid YouTube video IDs found in links',
                status: 'error'
            });
        }

        console.log(`[YouTube Video API] Fetching details for IDs: ${videoIds.join(', ')}`);

        const videos = await YouTubeAPI.fetchVideosByIds(videoIds.join(','));

        return res.status(200).json({
            data: videos,
            meta: {
                total_requested: links.length,
                total_found: videos.length,
            },
            status: 'success'
        });

    } catch (error) {
        console.error('[YouTube Video API] Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            status: 'error'
        });
    }
}
