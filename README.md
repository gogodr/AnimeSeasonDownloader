# Anime Downloader

A comprehensive web application for tracking and managing anime releases with integrated torrent search functionality. The application fetches anime data from AniList API, searches for torrents on Nyaa.si, and provides a modern React-based interface for browsing and managing anime collections.

## Features

### Core Functionality
- **Anime Data Management**: Automatically fetches upcoming anime from AniList API for current and previous quarters
- **Torrent Integration**: Searches and indexes torrents from Nyaa.si for each anime
- **Smart Parsing**: Automatically extracts episode numbers, season numbers, and subgroup names from torrent titles
- **Season Detection**: Intelligently detects anime season numbers from titles and descriptions
- **Caching System**: 2-week cache expiration to minimize API calls and improve performance
- **Automatic Updates**: Daily cron job at midnight (00:00 UTC) to refresh anime data

### User Interface
- **Quarter-Based Navigation**: Browse anime by quarters (Q1-Q4) and years
- **Anime Detail View**: View detailed information including episodes, torrents, and metadata
- **Responsive Design**: Modern, mobile-friendly UI with smooth transitions
- **Admin Panel**: Comprehensive admin interface for managing the application

### Admin Features
- **Alternative Titles Management**: Add, edit, and delete alternative titles for better torrent matching
- **Subgroup Management**: Enable/disable subgroups to filter torrent results
- **Manual Torrent Scanning**: Trigger torrent scans for specific anime with optional wipe previous option
- **Quarter Management**: View all cached quarters and force refresh data
- **Anime Search**: Search anime by title for quick access

### Technical Features
- **Rate Limiting**: Automatic retry logic for handling 429 rate limit errors
- **Concurrent Processing**: Uses p-queue for efficient parallel API requests
- **Database Migrations**: Automatic schema migrations for seamless updates
- **Episode Structure**: Organizes torrents by episode with airing dates
- **Season Filtering**: Filters torrents by season for multi-season anime

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd AnimeDownloader
```

2. Install dependencies:
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

**Note:** On startup, the server will automatically fetch and update anime data for the current quarter. This process runs in the background and may take a few minutes. The server will start immediately and will serve cached data if available.

## Running with Docker Compose

Docker Compose provides an easy way to run the application in a containerized environment. This is the recommended method for production deployments.

### Prerequisites

- [Docker](https://www.docker.com/get-started) installed (version 20.10 or later)
- [Docker Compose](https://docs.docker.com/compose/install/) installed (version 2.0 or later)

### Environment Variables

Create a `.env` file in the project root directory (or use environment variables from your shell) with the following optional variables:

```bash
# AniDB credentials (optional - required for AniDB integration features)
anidbUser=your_anidb_username
anidbPassword=your_anidb_password

# Anime storage location (optional - path on your host machine)
# This path will be mounted into the container at /app/anime
# Use absolute paths on Windows (e.g., D:\Anime) or Linux/Mac (e.g., /mnt/anime)
animeLocation=/path/to/your/anime/folder
```

**Note:** All environment variables are optional. The application will work without them, but certain features may be limited:
- Without AniDB credentials, AniDB-related features will be disabled
- Without `animeLocation`, you can still use the application but downloads won't be saved to a persistent location

### Building and Starting

1. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```
   
   The `-d` flag runs the container in detached mode (in the background).

2. **View logs:**
   ```bash
   docker-compose logs -f
   ```
   
   Press `Ctrl+C` to exit log viewing.

3. **Check container status:**
   ```bash
   docker-compose ps
   ```

4. **Access the application:**
   - Open your browser and navigate to `http://localhost:3000`
   - The application will be available once the container finishes starting up (usually 30-60 seconds for initial build)

### Docker Compose Commands

- **Start containers:**
  ```bash
  docker-compose up -d
  ```

- **Stop containers:**
  ```bash
  docker-compose stop
  ```

- **Stop and remove containers:**
  ```bash
  docker-compose down
  ```

- **Rebuild containers (after code changes):**
  ```bash
  docker-compose up -d --build
  ```

- **View logs:**
  ```bash
  docker-compose logs -f
  ```

- **View logs for last 100 lines:**
  ```bash
  docker-compose logs --tail=100 -f
  ```

- **Execute commands in the container:**
  ```bash
  docker-compose exec animedownloader sh
  ```

- **Restart the container:**
  ```bash
  docker-compose restart
  ```

### Data Persistence

The Docker setup includes:
- **Database persistence**: The SQLite database (`anime.db`) is stored in the container. To persist it across container recreations, you can add a volume mapping in `docker-compose.yml`:
  ```yaml
  volumes:
    - ${animeLocation}:/app/anime
    - ./anime.db:/app/anime.db  # Add this line for database persistence
  ```

- **Anime storage**: If `animeLocation` is set, your anime files will be stored on the host machine and persisted across container restarts.

### Health Check

The container includes a health check that monitors the application's availability. The health check:
- Runs every 30 seconds
- Checks the `/api/quarter` endpoint
- Has a 10-second timeout
- Allows 3 retries before marking as unhealthy
- Waits 40 seconds before starting (to allow the app to initialize)

You can check the health status with:
```bash
docker-compose ps
```

### Troubleshooting

**Container won't start:**
- Check logs: `docker-compose logs`
- Verify Docker is running: `docker ps`
- Ensure port 3000 is not in use by another application

**Application not accessible:**
- Wait a minute or two for the initial build and startup
- Check logs for errors: `docker-compose logs -f`
- Verify the container is healthy: `docker-compose ps`

**Database issues:**
- The database is created automatically on first startup
- To reset the database, stop the container, delete `anime.db` (if you mounted it as a volume), and restart

**Permission issues (Linux/Mac):**
- Ensure Docker has permission to access the `animeLocation` directory
- You may need to adjust directory permissions: `chmod 755 /path/to/anime`

### Production Considerations

For production deployments:
1. Use a reverse proxy (like Nginx or Traefik) in front of the container
2. Set up proper SSL/TLS certificates
3. Configure automated backups for the database
4. Use Docker secrets or environment variable management tools for sensitive credentials
5. Consider using Docker volumes for persistent data storage
6. Set up log rotation and monitoring

### Available Scripts

- `npm run dev` - Start development mode (Vite + Express with hot reload)
- `npm run dev:vite` - Start only Vite dev server
- `npm run dev:server` - Start only Express server with nodemon
- `npm run build` - Build production bundle
- `npm run build:watch` - Build production bundle in watch mode
- `npm run preview` - Preview production build
- `npm start` - Build and start production server

## Data Updates

The anime data is automatically updated:
- **On startup**: The server fetches fresh data for the current quarter when it starts (if cache is expired or missing)
- **Daily cron job**: A scheduled task runs every day at 00:00 UTC to refresh the data
- **Cache expiration**: Data is considered valid for 2 weeks (14 days)

All REST API endpoints query the SQLite database directly and do not make external API calls during requests, ensuring fast response times.

## API Endpoints

### Quarter Endpoints
- `GET /api/quarter/current-quarter` - Returns anime from the current quarter
- `GET /api/quarter/:quarter/:year` - Returns anime for a specific quarter and year (e.g., `/api/quarter/Q4/2024`)

### Anime Endpoints
- `GET /api/anime/id/:id` - Returns a specific anime by ID with all episodes and torrents
- `POST /api/anime/:id/scan-torrents` - Scans and updates torrents for a specific anime
  - Body: `{ wipePrevious: boolean }` (optional, defaults to false)
- `POST /api/anime/:id/subgroups/:subGroupId` - Enables or disables a subgroup for the anime
  - Body: `{ enabled: boolean }`

### Admin Endpoints
- `GET /api/admin/quarters` - Returns all quarters with their last update times
- `POST /api/admin/update-quarter` - Force updates anime data for a specific quarter and year
  - Body: `{ quarter: string, year: number }`
- `GET /api/admin/subgroups` - Returns all subgroups with their AniDB IDs (when available)
- `GET /api/admin/anime/search?q=<query>` - Searches anime by title for autocomplete
- `GET /api/admin/alternative-titles/all` - Returns all anime with their alternative titles
- `GET /api/admin/alternative-titles/:animeId` - Returns alternative titles for a specific anime
- `POST /api/admin/alternative-titles` - Adds or updates an alternative title
  - Body: `{ animeId: number, title: string, id?: number }` (id is optional for updates)
- `DELETE /api/admin/alternative-titles/:id` - Deletes an alternative title

## Database Schema

The application uses SQLite with the following main tables:

- **queries**: Tracks when data was last fetched for each quarter/year
- **anime**: Stores anime metadata (id, titles, images, descriptions, season, etc.)
- **genres**: Genre definitions
- **anime_genres**: Many-to-many relationship between anime and genres
- **episodes**: Episode information linked to anime
- **torrents**: Torrent data linked to episodes and subgroups
- **sub_groups**: Subgroup names and optional AniDB IDs
- **anime_sub_groups**: Links subgroups to anime with an enabled flag
- **alternative_titles**: Alternative titles for anime to improve torrent matching

## Project Structure

```
├── api/                    # API route handlers
│   ├── admin/             # Admin API routes
│   ├── anime/             # Anime API routes
│   ├── quarter/           # Quarter API routes
│   └── utils.js           # API utility functions
├── config/                # Configuration constants
│   └── constants.js       # API URLs, mappings, cache settings
├── database/              # Database operations
│   └── animeDB.js         # SQLite database initialization and queries
├── dist/                  # Production build output
├── models/                # Data models
│   └── anime.js           # Anime model and season extraction logic
├── parsers/               # Data parsers
│   ├── episodeParser.js   # Episode and season number parsing
│   └── subGroupParser.js  # Subgroup name parsing
├── services/              # Business logic
│   ├── anilist.js         # AniList API integration
│   ├── animeService.js    # Main anime processing service
│   └── nyaa.js            # Nyaa.si torrent search integration
├── src/                   # React frontend application
│   ├── Admin/             # Admin panel views and components
│   ├── Anime/             # Anime detail views and components
│   ├── Quarter/           # Quarter listing views and components
│   ├── Season/            # Season listing views and components
│   ├── Shared/            # Shared components (Sidebar, Loading, Error states)
│   ├── App.jsx            # Main React app component
│   └── main.jsx           # React entry point
├── utils/                 # Utility functions
│   └── helpers.js         # Helper functions (sleep, etc.)
├── index.js               # Application entry point
├── server.js              # Express server setup
├── vite.config.js         # Vite configuration
└── package.json           # Dependencies and scripts
```

## Technologies

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite (better-sqlite3)** - Database
- **node-cron** - Scheduled tasks
- **p-queue** - Concurrent request management
- **cheerio** - HTML parsing for Nyaa.si
- **rss-parser** - RSS feed parsing (if needed)

### Frontend
- **React** - UI framework
- **React Router DOM** - Client-side routing
- **Vite** - Build tool and dev server
- **CSS3** - Styling with modern design

## Key Functionality

### Torrent Search
- Searches Nyaa.si using multiple search terms (romaji, english, alternative titles)
- Handles pagination automatically
- Implements rate limiting with retry logic
- Filters results by season for multi-season anime
- Parses episode numbers, season numbers, and subgroup names from titles

### Season Detection
The application intelligently detects anime season numbers from:
- Title patterns (e.g., "Season 2", "Second Season", "Part 2")
- Description patterns (e.g., "the second season of", "the third part of")
- Ordinal numbers in titles (e.g., "Anime Name 2")

### Alternative Titles
Alternative titles improve torrent matching by:
- Adding common variations of anime names
- Supporting multiple languages and naming conventions
- Being used as additional search terms when scanning torrents

### Subgroup Management
- Automatically extracts subgroup names from torrent titles (e.g., `[SubsPlease]`)
- Allows enabling/disabling subgroups to filter results
- Supports bulk enable/disable operations

### Caching Strategy
- Data is cached for 2 weeks (14 days)
- Cache validity is checked before fetching new data
- Force refresh option available in admin panel
- Previous quarter data is also fetched to catch continuing series

## Development Notes

- The application uses ES modules (`type: "module"` in package.json)
- Database migrations are handled automatically on startup
- Rate limiting is implemented with exponential backoff for Nyaa.si requests
- Concurrent requests are limited using p-queue to avoid overwhelming APIs
- The frontend uses React Router for client-side navigation
- All API responses are JSON format

