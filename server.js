// server.js - Express server for Social Scraper

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

// API handlers
import tiktokHandler from './api/tiktok.js';
import tiktokVideoHandler from './api/tiktok-video.js';
import twitterHandler from './api/twitter.js';
import youtubeHandler from './api/youtube.js';
import youtubeVideoHandler from './api/youtube-video.js';
import instagramHandler from './api/instagram.js';
import statsHandler from './api/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.all('/api/tiktok/video', (req, res) => tiktokVideoHandler(req, res));
app.all('/api/tiktok', (req, res) => tiktokHandler(req, res));
app.all('/api/twitter', (req, res) => twitterHandler(req, res));
app.all('/api/youtube/video', (req, res) => youtubeVideoHandler(req, res));
app.all('/api/youtube', (req, res) => youtubeHandler(req, res));
app.all('/api/instagram', (req, res) => instagramHandler(req, res));
app.all('/api/stats', (req, res) => statsHandler(req, res));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'social-scraper', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Social Scraper running at http://localhost:${PORT}`);
    console.log(`📊 API endpoints: /api/tiktok, /api/twitter, /api/youtube, /api/instagram`);
});
