// lib/youtube-scraper.js - FREE YouTube scraper using page parsing
// No API key required - scrapes public channel pages

import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch channel videos from YouTube (FREE)
 */
export async function fetchChannelVideos(channelId, count = 30) {
    const cleanId = channelId.replace('@', '').trim();
    console.log(`[YouTube Scraper] Fetching videos for @${cleanId}`);

    try {
        // Try channel URL
        const url = `https://www.youtube.com/@${cleanId}/videos`;

        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 30000,
        });

        const html = response.data;

        // Extract ytInitialData JSON
        const dataMatch = html.match(/var ytInitialData = (.+?);<\/script>/s);
        if (!dataMatch) {
            console.log('[YouTube Scraper] No ytInitialData found');
            return { videos: [], channel: null };
        }

        const data = JSON.parse(dataMatch[1]);

        // Navigate to video tab content
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        const videosTab = tabs.find(t =>
            t.tabRenderer?.title === 'Videos' ||
            t.tabRenderer?.endpoint?.commandMetadata?.webCommandMetadata?.url?.includes('/videos')
        );

        const content = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

        const videos = content
            .filter(item => item.richItemRenderer?.content?.videoRenderer)
            .map(item => {
                const v = item.richItemRenderer.content.videoRenderer;
                return {
                    video_id: v.videoId || '',
                    title: v.title?.runs?.[0]?.text || '',
                    description: v.descriptionSnippet?.runs?.map(r => r.text).join('') || '',
                    url: `https://www.youtube.com/watch?v=${v.videoId}`,
                    views: parseViewCount(v.viewCountText?.simpleText || v.viewCountText?.runs?.[0]?.text || '0'),
                    duration: v.lengthText?.simpleText || '',
                    published: v.publishedTimeText?.simpleText || '',
                    thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
                };
            })
            .slice(0, count);

        // Extract channel info
        const channelMeta = data?.metadata?.channelMetadataRenderer || {};
        const channel = {
            name: channelMeta.title || cleanId,
            description: channelMeta.description || '',
            subscribers: data?.header?.c4TabbedHeaderRenderer?.subscriberCountText?.simpleText || '',
            avatar: channelMeta.avatar?.thumbnails?.[0]?.url || '',
        };

        console.log(`[YouTube Scraper] Found ${videos.length} videos`);
        return { videos, channel };

    } catch (error) {
        console.error(`[YouTube Scraper] Error:`, error.message);
        return { videos: [], channel: null, error: error.message };
    }
}

/**
 * Fetch a single video details by ID
 */
export async function fetchVideo(videoId) {
    console.log(`[YouTube Scraper] Fetching video ID: ${videoId}`);

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 30000,
        });

        const html = response.data;
        const dataMatch = html.match(/var ytInitialData = (.+?);<\/script>/s);

        if (!dataMatch) {
            console.log('[YouTube Scraper] No ytInitialData found for video');
            return null;
        }

        const data = JSON.parse(dataMatch[1]);
        const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];

        const primaryInfo = contents.find(c => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
        const secondaryInfo = contents.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;

        if (!primaryInfo) {
            console.log('[YouTube Scraper] Video primary info not found');
            return null;
        }

        const title = primaryInfo.title?.runs?.[0]?.text || '';
        const viewCountText = primaryInfo.viewCount?.videoViewCountRenderer?.viewCount?.simpleText ||
                              primaryInfo.viewCount?.videoViewCountRenderer?.viewCount?.runs?.[0]?.text || '0';

        const dateText = primaryInfo.dateText?.simpleText || '';

        // Likes are often in the top level menu or under actions
        // They are harder to parse reliably from initialData as they might be hidden or in different structures
        // We'll try to find them in menu buttons
        let likes = 0;
        try {
            const menuItems = primaryInfo.videoActions?.menuRenderer?.topLevelButtons || [];
            const likeButton = menuItems.find(item =>
                item.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.accessibilityText?.includes('like')
            );

            // This path is extremely deep and prone to change.
            // Often scraping likes is unreliable without API.
        } catch (e) {
            // Ignore like parsing errors
        }

        const channelName = secondaryInfo?.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || '';
        const channelId = secondaryInfo?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || '';
        const description = secondaryInfo?.attributedDescription?.content || '';

        return {
            video_id: videoId,
            url: url,
            title: title,
            description: description,
            views: parseViewCount(viewCountText),
            published_at: dateText,
            channel: {
                name: channelName,
                id: channelId
            },
            // Metadata for thumbnails etc can be found in microformat
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };

    } catch (error) {
        console.error(`[YouTube Scraper] Error fetching video ${videoId}:`, error.message);
        return null;
    }
}

function parseViewCount(text) {
    if (!text) return 0;
    const clean = text.replace(/[^0-9KMB.]/gi, '').toUpperCase();
    if (clean.includes('B')) return parseFloat(clean) * 1000000000;
    if (clean.includes('M')) return parseFloat(clean) * 1000000;
    if (clean.includes('K')) return parseFloat(clean) * 1000;
    return parseInt(clean) || 0;
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
        description: v.description || v.title,
        views: v.views,
        likes: 0, // Not available from page scrape
        comments: 0,
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
            page,
            total_pages: totalPages,
            total_posts: totalPosts,
            request_time: requestTime,
        },
        data: paginated,
        status: 'success'
    };
}

export default { fetchChannelVideos, fetchVideo, transformVideos };
