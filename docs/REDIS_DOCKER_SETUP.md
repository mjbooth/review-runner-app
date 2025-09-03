# Redis Docker Setup for Review Runner

## Quick Start

### 1. Start Redis

```bash
# Start Redis container
npm run redis:start

# Or with GUI management tool
npm run redis:start-gui
```

### 2. Verify Redis is Running

```bash
npm run redis:status
```

### 3. Your Redis is Ready!

Redis is now running on `localhost:6379`. The default connection string in `.env` will work:

```env
REDIS_URL="redis://localhost:6379"
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run redis:start` | Start Redis container |
| `npm run redis:start-gui` | Start Redis with web GUI (port 8081) |
| `npm run redis:stop` | Stop Redis container |
| `npm run redis:status` | Check Redis status |
| `npm run redis:logs` | View Redis logs |
| `npm run redis:cli` | Connect to Redis CLI |

## Docker Compose Details

The `docker-compose.yml` includes:

- **Redis 7 Alpine**: Lightweight Redis instance
- **Persistent Storage**: Data survives container restarts
- **Health Checks**: Automatic health monitoring
- **Redis Commander** (optional): Web-based GUI at http://localhost:8081

## Testing Redis Connection

### Using Redis CLI

```bash
# Connect to Redis CLI
npm run redis:cli

# In Redis CLI, test with:
ping
# Should return: PONG

set test "Hello Redis"
get test
# Should return: "Hello Redis"

exit
```

### Testing with the Application

1. Ensure Redis is running: `npm run redis:status`
2. Start the app: `npm run dev`
3. Run email test: `npm run test:email`

## Troubleshooting

### Port Already in Use

If port 6379 is already in use:

```bash
# Find what's using the port
lsof -i :6379

# Or change the port in docker-compose.yml:
ports:
  - "6380:6379"  # Use port 6380 instead
  
# Then update .env:
REDIS_URL="redis://localhost:6380"
```

### Container Won't Start

```bash
# Check Docker is running
docker ps

# Remove old containers
docker-compose down -v

# Start fresh
npm run redis:start
```

### Can't Connect from App

1. Check Redis is running: `docker ps`
2. Test connection: `docker exec review-runner-redis redis-cli ping`
3. Verify `.env` has correct URL: `REDIS_URL="redis://localhost:6379"`
4. Restart the app after changing `.env`

## Data Persistence

Redis data is persisted in a Docker volume. To completely reset:

```bash
# Stop and remove everything including volumes
docker-compose down -v

# Start fresh
npm run redis:start
```

## Production Considerations

For production, consider:

1. **Managed Redis**: Use Redis Cloud, AWS ElastiCache, or Upstash
2. **Authentication**: Add Redis password in production
3. **Backup**: Configure Redis persistence and backups
4. **Monitoring**: Set up Redis monitoring and alerts

## Using Redis Commander GUI

If you started with GUI (`npm run redis:start-gui`):

1. Open http://localhost:8081
2. You'll see your Redis instance listed
3. Browse keys, view values, and monitor in real-time

This is helpful for debugging job queues and seeing what's stored in Redis.
