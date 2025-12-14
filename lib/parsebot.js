// lib/parsebot.js - Parse.bot TikTok Scraper Service
// FREE API for TikTok data

import axios from 'axios';

const PARSEBOT_BASE_URL = 'https://api.parse.bot/scraper';
const PARSEBOT_SCRAPER_ID = 'dc8d000f-49f1-4d97-b357-9b0c4e5c5c07';

/**
 * Get API key at runtime (not module load time)
 */
function getApiKey() {
    return process.env.PARSEBOT_API_KEY || '';
}

/**
 * Fetch user videos from TikTok via parse.bot
 * @param {string} username - TikTok username
 * @param {number} count - Number of videos to fetch
 * @returns {Promise<object>} - Video data
 */
export async function fetchUserVideos(username, count = 50) {
    const cleanUsername = username.replace('@', '').trim();
    const apiKey = getApiKey();

    console.log(`[ParseBot] Fetching ${count} videos for @${cleanUsername}`);
    console.log(`[ParseBot] API Key present: ${Boolean(apiKey)}`);

    if (!apiKey) {
        console.error('[ParseBot] No API key configured. Set PARSEBOT_API_KEY env var.');
        throw new Error('No parse.bot API key configured. Set PARSEBOT_API_KEY environment variable.');
    }

    const url = `${PARSEBOT_BASE_URL}/${PARSEBOT_SCRAPER_ID}/get_user_videos`;

    try {
        const response = await axios.post(url, {
            count: String(count),
            username: cleanUsername
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            timeout: 120000 // 2 minute timeout
        });

        console.log(`[ParseBot] Retrieved ${response.data?.videos?.length || 0} videos`);

        return response.data;
    } catch (error) {
        console.error(`[ParseBot] Error:`, error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
}

/**
 * Transform parse.bot response to standardized format
 */
export function transformVideos(rawData, username, page = 1, perPage = 10) {
    const requestTime = Math.floor(Date.now() / 1000);

    const videosArray = rawData?.videos || rawData?.items || [];

    if (!videosArray || videosArray.length === 0) {
        return {
            meta: {
                username: rawData?.username || username,
                page,
                total_pages: 0,
                posts_per_page: perPage,
                total_posts: 0,
                request_time: requestTime,
            },
            data: [],
            status: 'success'
        };
    }

    const videos = videosArray;

    const transformedVideos = videos.map(video => ({
        video_id: video.id || video.video_id || '',
        url: video.url || video.video_url || video.link || `https://www.tiktok.com/@${username}/video/${video.id}`,
        description: video.description || video.desc || video.text || video.caption || '',
        epoch_time_posted: video.create_time || video.createTime || video.timestamp || 0,
        views: video.play_count || video.playCount || video.views || 0,
        likes: video.digg_count || video.diggCount || video.likes || 0,
        comments: video.comment_count || video.commentCount || video.comments || 0,
        shares: video.share_count || video.shareCount || video.shares || 0,
        cover_image: video.cover || video.cover_image || video.thumbnail || '',
        video_url: video.download_url || video.video_url || '',
        author: {
            id: video.author?.id || video.author_id || '',
            username: video.author?.unique_id || video.author?.username || username,
            nickname: video.author?.nickname || '',
            avatar: video.author?.avatar || '',
        },
        music: {
            id: video.music?.id || '',
            name: video.music?.title || video.music?.name || '',
            author: video.music?.author || '',
        },
        hashtags: video.hashtags || [],
    }));

    transformedVideos.sort((a, b) => b.epoch_time_posted - a.epoch_time_posted);

    const totalPosts = transformedVideos.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginatedVideos = transformedVideos.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username: rawData?.username || username,
            page,
            total_pages: totalPages,
            posts_per_page: perPage,
            total_posts: totalPosts,
            request_time: requestTime,
        },
        data: paginatedVideos,
        status: 'success'
    };
}

export default {
    fetchUserVideos,
    transformVideos,
};
