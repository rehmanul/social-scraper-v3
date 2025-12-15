// lib/instagram-scraper.js - Instagram Scraper using Playwright
// Intercepts GraphQL/API responses for reliable data

import { chromium } from 'playwright';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchUserPosts(username, count = 30) {
    const cleanUsername = username.replace('@', '').trim();
    console.log(`[Instagram Scraper] Fetching posts for @${cleanUsername} using Playwright`);

    let browser = null;
    let posts = [];
    let user = null;

    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
            userAgent: USER_AGENT,
            viewport: { width: 1280, height: 800 },
            locale: 'en-US',
            timezoneId: 'America/New_York',
            deviceScaleFactor: 2,
        });

        // Set cookies if available in env
        if (process.env.IG_SESSION_ID) {
            console.log('[Instagram] Setting session cookie');
            await context.addCookies([{
                name: 'sessionid',
                value: process.env.IG_SESSION_ID,
                domain: '.instagram.com',
                path: '/'
            }]);
        }

        const page = await context.newPage();

        // Listen for GraphQL or API responses
        page.on('response', async response => {
            const url = response.url();
            // Look for web profile info or graphql query results
            if (url.includes('graphql/query') || url.includes('api/v1/users/web_profile_info') || url.includes('?__a=1')) {
                try {
                    const json = await response.json();

                    // Handle GraphQL response
                    if (json.data?.user?.edge_owner_to_timeline_media) {
                        console.log('[Instagram] Intercepted GraphQL timeline data');
                        const edges = json.data.user.edge_owner_to_timeline_media.edges || [];
                        const interceptedPosts = edges.map(e => e.node).map(parseNode);
                        posts = [...posts, ...interceptedPosts];

                        if (!user && json.data.user) {
                            user = {
                                username: json.data.user.username,
                                full_name: json.data.user.full_name,
                                followers: json.data.user.edge_followed_by?.count
                            };
                        }
                    }
                } catch (e) {
                    // Ignore JSON parse errors for non-JSON responses
                }
            }
        });

        // Navigate to profile
        const url = `https://www.instagram.com/${cleanUsername}/`;
        console.log(`[Instagram] Navigating to ${url}`);

        // Block images/fonts to speed up
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2}', route => route.abort());

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // If we didn't get data from network, try extracting from sharedData script
        if (posts.length === 0) {
            console.log('[Instagram] Network intercept empty, trying window._sharedData...');
            const sharedData = await page.evaluate(() => {
                // Look for common scripts where IG stores initial state
                if (window._sharedData) return window._sharedData;

                // Sometimes it's in a different object or embedded in a script tag we need to parse
                // Let's try to find the script tag containing "edge_owner_to_timeline_media"
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const s of scripts) {
                    if (s.textContent.includes('edge_owner_to_timeline_media')) {
                        return s.textContent;
                    }
                }
                return null;
            });

            if (sharedData) {
                // Simple regex extraction if it's a string
                let jsonStr = typeof sharedData === 'string' ? sharedData : JSON.stringify(sharedData);
                try {
                    // If it's the raw script content, try to find the JSON object
                    if (typeof sharedData === 'string' && !sharedData.startsWith('{')) {
                         const match = sharedData.match(/({.*})/);
                         if (match) jsonStr = match[1];
                    }

                    const json = JSON.parse(jsonStr);
                    // Traverse deep to find media
                    // This is heuristic, as structure changes
                    const findKey = (obj, key) => {
                        if (!obj || typeof obj !== 'object') return null;
                        if (obj[key]) return obj[key];
                        for (const k in obj) {
                            const found = findKey(obj[k], key);
                            if (found) return found;
                        }
                        return null;
                    };

                    const timeline = findKey(json, 'edge_owner_to_timeline_media');
                    if (timeline && timeline.edges) {
                        console.log('[Instagram] Found data in scripts');
                        const scriptPosts = timeline.edges.map(e => e.node).map(parseNode);
                        posts = [...posts, ...scriptPosts];
                    }
                } catch (e) {
                    console.log('[Instagram] Failed to parse script data:', e.message);
                }
            }
        }

        // Final Fallback: Scrape visible grid
        if (posts.length === 0) {
            console.log('[Instagram] Fallback to visible grid scraping...');
            const gridPosts = await page.evaluate((maxCount) => {
                // Try to find the images in the grid
                // IG images usually have alt text, and are wrapped in links
                const images = Array.from(document.querySelectorAll('article img')).slice(0, maxCount);

                return images.map(img => {
                    const anchor = img.closest('a');
                    const url = anchor ? anchor.href : '';
                    const shortcode = url.split('/p/')[1]?.split('/')[0] || '';

                    return {
                        post_id: shortcode || Math.random().toString(36).substring(7),
                        url: url,
                        description: img.alt || '',
                        thumbnail: img.src,
                        is_video: false,
                        likes: 0,
                        comments: 0,
                        timestamp: Date.now() / 1000
                    };
                });
            }, count);
            posts = gridPosts;
        }

        console.log(`[Instagram] Total posts found: ${posts.length}`);

        // Ensure user object exists
        if (!user) {
            user = await page.evaluate(() => {
                const title = document.title;
                const match = title.match(/@([^)\s]+)/); // Extract handle from title if possible
                return {
                    username: match ? match[1] : '',
                    full_name: document.querySelector('header h2')?.textContent || ''
                };
            });
        }

        return {
            posts: posts.slice(0, count),
            user: user,
            source: 'instagram-playwright'
        };

    } catch (error) {
        console.error('[Instagram] Playwright error:', error.message);
        return { posts: [], error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

function parseNode(node) {
    return {
        post_id: node.shortcode || node.id,
        url: `https://www.instagram.com/p/${node.shortcode}/`,
        description: node.edge_media_to_caption?.edges?.[0]?.node?.text || node.accessibility_caption || '',
        thumbnail: node.display_url || node.thumbnail_src,
        likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
        comments: node.edge_media_to_comment?.count || 0,
        views: node.video_view_count || 0,
        is_video: node.is_video || false,
        timestamp: node.taken_at_timestamp || Math.floor(Date.now() / 1000)
    };
}

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
        views: p.views || 0,
        likes: p.likes,
        comments: p.comments,
        cover_image: p.thumbnail,
        is_video: p.is_video,
        timestamp: p.timestamp
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
            source: rawData?.source,
        },
        data: paginated,
        status: 'success'
    };
}

export default { fetchUserPosts, transformPosts };
