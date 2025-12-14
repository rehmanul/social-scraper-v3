// lib/tiktok-scraper.js - Lightweight TikTok scraper without native dependencies
// Uses TikTok's web API directly + SIGI_STATE parsing
// Fallback when parse.bot API fails

import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch user posts by scraping profile page
 */
export async function fetchUserPosts(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[TikTok Scraper] Fetching posts for @${cleanUsername}`);

    try {
        const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
        const pageResponse = await axios.get(profileUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 30000
        });

        const html = pageResponse.data;

        // Extract SIGI_STATE JSON data from page
        const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>(.+?)<\/script>/s);

        let posts = [];
        let user = null;

        if (sigiMatch) {
            try {
                const sigiState = JSON.parse(sigiMatch[1]);
                const itemModule = sigiState.ItemModule || {};
                const userModule = sigiState.UserModule || {};

                // Get user info
                const users = Object.values(userModule.users || {});
                if (users.length > 0) {
                    user = users[0];
                }

                // Get video posts
                posts = Object.values(itemModule);

                // Sort by createTime (newest first)
                posts.sort((a, b) => b.createTime - a.createTime);

                // Limit count
                posts = posts.slice(0, count);

            } catch (e) {
                console.log('[TikTok Scraper] Failed to parse SIGI_STATE:', e.message);
                throw new Error('Failed to parse TikTok page content');
            }
        } else {
            console.log('[TikTok Scraper] SIGI_STATE not found');
            // Try __UNIVERSAL_DATA_FOR_REHYDRATION__
            const univMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.+?)<\/script>/s);
            if (univMatch) {
                try {
                    const univData = JSON.parse(univMatch[1]);
                    const userDetail = univData?.__DEFAULT_SCOPE__?.['webapp.user-detail'];

                    if (userDetail?.itemStruct) {
                        posts = userDetail.itemStruct;
                    }
                } catch (e) {
                    console.log('[TikTok Scraper] Failed to parse UNIVERSAL_DATA:', e.message);
                }
            }
        }

        if (posts.length === 0) {
            throw new Error('No videos found (Anti-scraping protection likely active)');
        }

        console.log(`[TikTok Scraper] Found ${posts.length} videos`);

        return {
            videos: posts.map(post => ({
                id: post.id,
                desc: post.desc,
                createTime: post.createTime,
                stats: post.stats,
                author: post.author,
                video: post.video,
                music: post.music
            })),
            user: user,
            source: 'page_scraping'
        };

    } catch (error) {
        console.error(`[TikTok Scraper] Error:`, error.message);
        throw error;
    }
}

/**
 * Transform scraped data to standard format
 */
export function transformScrapedVideos(rawData, username, page = 1, perPage = 10) {
    const requestTime = Math.floor(Date.now() / 1000);
    const videos = rawData?.videos || [];

    const transformed = videos.map(v => ({
        video_id: v.id,
        url: `https://www.tiktok.com/@${username}/video/${v.id}`,
        description: v.desc || '',
        epoch_time_posted: v.createTime || 0,
        views: v.stats?.playCount || 0,
        likes: v.stats?.diggCount || 0,
        comments: v.stats?.commentCount || 0,
        shares: v.stats?.shareCount || 0,
        cover_image: v.video?.cover || '',
        video_url: v.video?.playAddr || '',
        author: {
            id: v.author?.id || '',
            username: v.author?.uniqueId || username,
            nickname: v.author?.nickname || '',
            avatar: v.author?.avatarThumb || '',
        },
        music: {
            id: v.music?.id || '',
            name: v.music?.title || '',
            author: v.music?.authorName || '',
        }
    }));

    const totalPosts = transformed.length;
    const totalPages = Math.ceil(totalPosts / perPage);
    const startIndex = (page - 1) * perPage;
    const paginated = transformed.slice(startIndex, startIndex + perPage);

    return {
        meta: {
            username: rawData?.user?.uniqueId || username,
            page,
            total_pages: totalPages,
            posts_per_page: perPage,
            total_posts: totalPosts,
            request_time: requestTime,
            source: 'page_scraping'
        },
        data: paginated,
        status: 'success'
    };
}
