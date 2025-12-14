// lib/instagram-scraper.js - Instagram scraper with SESSION COOKIES from env
// Uses authenticated session for reliable scraping

import axios from 'axios';

// Instagram session cookies from environment variables
const IG_COOKIES = {
    csrftoken: process.env.IG_CSRF_TOKEN || '',
    sessionid: process.env.IG_SESSION_ID || '',
    ds_user_id: process.env.IG_USER_ID || '',
    mid: process.env.IG_MID || '',
    ig_did: process.env.IG_DID || '',
    datr: process.env.IG_DATR || '',
};

// Check if cookies are configured
const hasCookies = Boolean(IG_COOKIES.sessionid && IG_COOKIES.csrftoken);

// Build cookie string
function getCookieString() {
    return Object.entries(IG_COOKIES)
        .filter(([k, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch user posts from Instagram using authenticated session
 */
export async function fetchUserPosts(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Instagram Scraper] Fetching posts for @${cleanUsername} (cookies: ${hasCookies})`);

    if (!hasCookies) {
        console.warn('[Instagram] No cookies configured. Set IG_SESSION_ID, IG_CSRF_TOKEN, etc.');
        return { posts: [], error: 'No Instagram cookies configured' };
    }

    try {
        // Method 1: Try GraphQL API with session
        const posts = await fetchViaGraphQL(cleanUsername, count);
        if (posts.length > 0) {
            return { posts, user: null, source: 'graphql' };
        }

        // Method 2: Try web profile with session
        return await fetchViaWebProfile(cleanUsername, count);

    } catch (error) {
        console.error(`[Instagram Scraper] Error:`, error.message);
        return { posts: [], error: error.message };
    }
}

/**
 * Fetch via Instagram GraphQL API
 */
async function fetchViaGraphQL(username, count) {
    console.log(`[Instagram] Trying GraphQL API...`);

    const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

    const response = await axios.get(profileUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Cookie': getCookieString(),
            'X-CSRFToken': IG_COOKIES.csrftoken,
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `https://www.instagram.com/${username}/`,
        },
        timeout: 30000,
    });

    const userData = response.data?.data?.user;

    if (!userData) {
        throw new Error('User not found or private');
    }

    const edges = userData.edge_owner_to_timeline_media?.edges || [];

    const posts = edges.slice(0, count).map(edge => {
        const node = edge.node;
        return {
            post_id: node.shortcode,
            url: `https://www.instagram.com/p/${node.shortcode}/`,
            description: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
            likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
            comments: node.edge_media_to_comment?.count || 0,
            views: node.video_view_count || 0,
            is_video: node.is_video || false,
            thumbnail: node.thumbnail_src || node.display_url,
            timestamp: node.taken_at_timestamp,
        };
    });

    console.log(`[Instagram] GraphQL returned ${posts.length} posts`);

    return posts;
}

/**
 * Fetch via web profile page
 */
async function fetchViaWebProfile(username, count) {
    console.log(`[Instagram] Trying web profile...`);

    const url = `https://www.instagram.com/${username}/`;

    const response = await axios.get(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Cookie': getCookieString(),
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 30000,
    });

    const html = response.data;

    // Try to extract JSON data
    const sharedDataMatch = html.match(/<script type="text\/javascript">window\._sharedData = (.+?);<\/script>/);

    let posts = [];
    let user = null;

    if (sharedDataMatch) {
        try {
            const sharedData = JSON.parse(sharedDataMatch[1]);
            const userData = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;

            if (userData) {
                user = {
                    id: userData.id,
                    username: userData.username,
                    full_name: userData.full_name,
                    followers: userData.edge_followed_by?.count || 0,
                };

                const edges = userData.edge_owner_to_timeline_media?.edges || [];
                posts = edges.slice(0, count).map(e => ({
                    post_id: e.node.shortcode,
                    url: `https://www.instagram.com/p/${e.node.shortcode}/`,
                    description: e.node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    likes: e.node.edge_liked_by?.count || 0,
                    comments: e.node.edge_media_to_comment?.count || 0,
                    views: e.node.video_view_count || 0,
                    is_video: e.node.is_video || false,
                    thumbnail: e.node.thumbnail_src || e.node.display_url,
                    timestamp: e.node.taken_at_timestamp,
                }));
            }
        } catch (e) {
            console.log('[Instagram] Failed to parse sharedData:', e.message);
        }
    }

    console.log(`[Instagram] Web profile returned ${posts.length} posts`);

    return { posts, user, source: 'web_profile' };
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
            source: rawData?.source,
        };
    }

    const transformed = posts.map(p => ({
        post_id: p.post_id,
        url: p.url,
        description: p.description,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        cover_image: p.thumbnail,
        is_video: p.is_video,
        timestamp: p.timestamp,
    }));

    const totalPosts = transformed.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginated = transformed.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username: rawData?.user?.username || username,
            followers: rawData?.user?.followers,
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

export default { fetchUserPosts, transformPosts };
