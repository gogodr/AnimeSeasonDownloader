# Anime Downloader

A web application that displays anime from the current season using data stored in a SQLite database.

## Features

- Express server with REST API
- React.js frontend with beautiful anime card displays
- SQLite database for storing anime information
- Automatic season detection based on current date
- Automatic data updates on server startup
- Daily cron job to refresh anime data at midnight (00:00 UTC)
- REST API queries database directly (no external API calls during requests)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

### Development Mode
Start both Vite dev server (with hot reload for JSX) and the Express server:
```bash
npm run dev
```

This will start:
- **Vite dev server** on `http://localhost:5173` with automatic JSX hot reload
- **Express server** on `http://localhost:3000` with automatic restarts on backend changes

All changes to JSX files will trigger instant hot module replacement (HMR) without page refresh. Changes to backend files will trigger an automatic server restart.

### Production Mode
Build and start:
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

**Note:** On startup, the server will automatically fetch and update anime data for the current season. This process runs in the background and may take a few minutes. The server will start immediately and will serve cached data if available.

## Data Updates

The anime data is automatically updated:
- **On startup**: The server fetches fresh data for the current season when it starts
- **Daily cron job**: A scheduled task runs every day at 00:00 UTC to refresh the data

All REST API endpoints query the SQLite database directly and do not make external API calls, ensuring fast response times.

## API Endpoints

- `GET /api/anime/current-season` - Returns anime from the current season
- `GET /api/anime/:season/:year` - Returns anime for a specific season and year (e.g., `/api/anime/SPRING/2024`)
- `GET /api/anime/id/:id` - Returns a specific anime by ID

## Project Structure

```
├── api/              # External API integrations (AniList, Nyaa)
├── config/           # Configuration constants
├── database/         # Database operations
├── models/           # Data models
├── parsers/          # Data parsers
├── services/         # Business logic
├── src/              # React application
│   ├── components/   # React components
│   └── ...
├── server.js         # Express server
└── index.js          # Entry point
```

## Technologies

- **Backend**: Express.js, Node.js
- **Frontend**: React.js, Vite
- **Database**: SQLite (better-sqlite3)
- **Scheduling**: node-cron for daily updates
- **Styling**: CSS3 with modern design

