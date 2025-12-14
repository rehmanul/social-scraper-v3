// lib/instagram-official.js - Instagram Graph API (Official)
// Uses long-lived access token for API access

import axios from 'axios';

// Instagram Graph API token
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ||
    'IGAALZBJiPppspBZAFNiY1h6aTdNbThqR1hEb1hUS2xjUmFvdFFUcWpZAQ0hXeWp6SHZAvVXF6cjRkZAnF5VEQ4S3JrSlBDdlc3QUFtNWlIYk1CVGVGQ2I0Slc2YjMtT1BFMWZAMc0dvUlBqTmo3ODR3ak1iSDhNNkxQYTFqMXdLOS1YbwZDZD';

const API_BASE = 'https://graph.instagram.com';

/**
 * Fetch user media using Instagram Graph API
 * Note: This API only works for the account owner's media (your own account)
 * For public profiles, we fall back to scraping
 */
export async function fetchUserMedia(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Instagram Official API] Fetching media for @${cleanUsername}`);

    try {
        // Get user profile and media
        // Note: Instagram Graph API requires user to be the account owner
        // or have a connected Facebook Page

        const response = await axios.get(`${API_BASE}/me/media`, {
            params: {
                access_token: INSTAGRAM_ACCESS_TOKEN,
                fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,username',
                limit: Math.min(count, 100),
            },
            timeout: 30000,
        });

        const media = response.data?.data || [];

        // Get user profile info
        const profileResponse = await axios.get(`${API_BASE}/me`, {
            params: {
                access_token: INSTAGRAM_ACCESS_TOKEN,
                fields: 'id,username,account_type,media_count',
            },
            timeout: 30000,
        });

        const profile = profileResponse.data;

        console.log(`[Instagram Official API] Retrieved ${media.length} media items`);

        return {
            posts: media.map(m => ({
                post_id: m.id,
                url: m.permalink,
                description: m.caption || '',
                media_type: m.media_type,
                media_url: m.media_url,
                thumbnail: m.thumbnail_url || m.media_url,
                likes: m.like_count || 0,
                comments: m.comments_count || 0,
                timestamp: m.timestamp,
                username: m.username,
            })),
            user: {
                id: profile.id,
                username: profile.username,
                account_type: profile.account_type,
                media_count: profile.media_count,
            },
        };

    } catch (error) {
        console.error(`[Instagram Official API] Error:`, error.response?.data || error.message);

        // Check if it's a permission error (trying to access other users)
        if (error.response?.status === 400 || error.response?.data?.error?.code === 100) {
            console.log('[Instagram Official API] Cannot access this user, falling back to scraping');
            const { fetchUserPosts: scrapeFetch, transformPosts } = await import('./instagram-scraper.js');
            return scrapeFetch(cleanUsername, count);
        }

        throw new Error(error.response?.data?.error?.message || error.message);
    }
}

/**
 * Fetch public user profile (uses scraping as fallback)
 * Instagram Graph API only allows accessing own account
 */
export async function fetchPublicProfile(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();

    // For public profiles, use scraping
    console.log(`[Instagram API] Fetching public profile @${cleanUsername}`);
    const { fetchUserPosts } = await import('./instagram-scraper.js');
    return fetchUserPosts(cleanUsername, count);
}

/**
 * Transform to standard format
 */
export function transformPosts(rawData, username, page = 1, perPage = 10) {
    const requestTime = Math.floor(Date.now() / 1000);
    const posts = rawData?.posts || [];

    if (posts.length === 0) {
        return {
            meta: { username, page, total_pages: 0, total_posts: 0, request_time: requestTime },
            data: [],
            status: rawData?.error ? 'partial' : 'success',
            error: rawData?.error,
        };
    }

    const transformed = posts.map(p => ({
        post_id: p.post_id,
        url: p.url,
        description: p.description,
        views: p.views || 0,
        likes: p.likes,
        comments: p.comments,
        cover_image: p.thumbnail || p.media_url,
        is_video: p.media_type === 'VIDEO',
        timestamp: p.timestamp,
    }));

    const totalPosts = transformed.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginated = transformed.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username: rawData?.user?.username || username,
            page,
            total_pages: totalPages,
            total_posts: totalPosts,
            request_time: requestTime,
        },
        data: paginated,
        status: 'success'
    };
}

export default { fetchUserMedia, fetchPublicProfile, transformPosts };
