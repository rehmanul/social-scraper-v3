// lib/youtube-official.js - YouTube Data API v3 (Official)
// Free tier: 10,000 units/day (1 search = 100 units, 1 video list = 1 unit)

import axios from 'axios';

// YouTube API credentials from environment variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || null;
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || null;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || null;

// For API key-less operation, we'll scrape (already working)
// But with API key, we get better data

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Fetch channel videos using YouTube Data API v3
 * Falls back to scraping if no API key
 */
export async function fetchChannelVideos(channelHandle, count = 30) {
    const cleanHandle = channelHandle.replace('@', '').trim();
    console.log(`[YouTube Official API] Fetching videos for @${cleanHandle}`);

    // If no API key, fall back to scraping method
    if (!YOUTUBE_API_KEY) {
        console.log('[YouTube Official API] No API key, using page scraping method');
        const { fetchChannelVideos: scrapeFetch } = await import('./youtube-scraper.js');
        return scrapeFetch(cleanHandle, count);
    }

    try {
        // Step 1: Search for channel by handle
        const searchResponse = await axios.get(`${API_BASE}/search`, {
            params: {
                key: YOUTUBE_API_KEY,
                q: cleanHandle,
                type: 'channel',
                part: 'snippet',
                maxResults: 1,
            },
            timeout: 30000,
        });

        const channelId = searchResponse.data?.items?.[0]?.id?.channelId;
        if (!channelId) {
            throw new Error('Channel not found');
        }

        // Step 2: Get channel details
        const channelResponse = await axios.get(`${API_BASE}/channels`, {
            params: {
                key: YOUTUBE_API_KEY,
                id: channelId,
                part: 'snippet,statistics,contentDetails',
            },
            timeout: 30000,
        });

        const channel = channelResponse.data?.items?.[0];
        const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

        // Step 3: Get videos from uploads playlist
        const videosResponse = await axios.get(`${API_BASE}/playlistItems`, {
            params: {
                key: YOUTUBE_API_KEY,
                playlistId: uploadsPlaylistId,
                part: 'snippet,contentDetails',
                maxResults: Math.min(count, 50),
            },
            timeout: 30000,
        });

        const videoIds = videosResponse.data?.items?.map(v => v.contentDetails.videoId).join(',');

        // Step 4: Get video statistics
        const statsResponse = await axios.get(`${API_BASE}/videos`, {
            params: {
                key: YOUTUBE_API_KEY,
                id: videoIds,
                part: 'statistics,contentDetails',
            },
            timeout: 30000,
        });

        const statsMap = {};
        statsResponse.data?.items?.forEach(v => {
            statsMap[v.id] = v;
        });

        const videos = videosResponse.data?.items?.map(item => {
            const stats = statsMap[item.contentDetails.videoId];
            return {
                video_id: item.contentDetails.videoId,
                title: item.snippet.title,
                description: item.snippet.description,
                url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                published: item.snippet.publishedAt,
                views: parseInt(stats?.statistics?.viewCount) || 0,
                likes: parseInt(stats?.statistics?.likeCount) || 0,
                comments: parseInt(stats?.statistics?.commentCount) || 0,
                duration: stats?.contentDetails?.duration || '',
            };
        }) || [];

        console.log(`[YouTube Official API] Retrieved ${videos.length} videos`);

        return {
            videos,
            channel: {
                id: channelId,
                name: channel?.snippet?.title,
                description: channel?.snippet?.description,
                subscribers: parseInt(channel?.statistics?.subscriberCount) || 0,
                totalViews: parseInt(channel?.statistics?.viewCount) || 0,
                videoCount: parseInt(channel?.statistics?.videoCount) || 0,
                avatar: channel?.snippet?.thumbnails?.high?.url,
            },
        };

    } catch (error) {
        console.error(`[YouTube Official API] Error:`, error.response?.data || error.message);

        // Fall back to scraping
        console.log('[YouTube Official API] Falling back to page scraping');
        const { fetchChannelVideos: scrapeFetch } = await import('./youtube-scraper.js');
        return scrapeFetch(cleanHandle, count);
    }
}

/**
 * Transform to standard format
 */
export function transformVideos(rawData, username, page = 1, perPage = 10) {
    const requestTime = Math.floor(Date.now() / 1000);
    const videos = rawData?.videos || [];

    if (videos.length === 0) {
        return {
            meta: { username, page, total_pages: 0, total_posts: 0, request_time: requestTime },
            data: [],
            status: 'success'
        };
    }

    const transformed = videos.map(v => ({
        video_id: v.video_id,
        url: v.url,
        title: v.title,
        description: v.description?.substring(0, 200) || v.title,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        cover_image: v.thumbnail,
        duration: v.duration,
        published_at: v.published,
    }));

    const totalPosts = transformed.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginated = transformed.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username: rawData?.channel?.name || username,
            subscribers: rawData?.channel?.subscribers,
            page,
            total_pages: totalPages,
            total_posts: totalPosts,
            request_time: requestTime,
        },
        data: paginated,
        status: 'success'
    };
}

export default { fetchChannelVideos, transformVideos };
