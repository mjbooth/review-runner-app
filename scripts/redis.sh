#!/bin/bash

# Redis Docker Management Script

COMMAND=${1:-help}

case $COMMAND in
  start)
    echo "🚀 Starting Redis..."
    docker-compose up -d redis
    echo "✅ Redis is running on localhost:6379"
    ;;
    
  start-with-gui)
    echo "🚀 Starting Redis with GUI..."
    docker-compose up -d
    echo "✅ Redis is running on localhost:6379"
    echo "🖥️  Redis Commander GUI available at http://localhost:8081"
    ;;
    
  stop)
    echo "🛑 Stopping Redis..."
    docker-compose down
    echo "✅ Redis stopped"
    ;;
    
  restart)
    echo "🔄 Restarting Redis..."
    docker-compose restart redis
    echo "✅ Redis restarted"
    ;;
    
  status)
    echo "📊 Redis Status:"
    docker-compose ps
    echo ""
    echo "🔍 Redis Info:"
    docker exec review-runner-redis redis-cli INFO server | grep -E "redis_version|uptime_in_seconds"
    ;;
    
  logs)
    echo "📜 Redis Logs:"
    docker-compose logs -f redis
    ;;
    
  cli)
    echo "🖥️  Connecting to Redis CLI..."
    docker exec -it review-runner-redis redis-cli
    ;;
    
  flush)
    echo "⚠️  Flushing all Redis data..."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      docker exec review-runner-redis redis-cli FLUSHALL
      echo "✅ Redis data flushed"
    else
      echo "❌ Operation cancelled"
    fi
    ;;
    
  help|*)
    echo "Redis Docker Management Commands:"
    echo "  ./scripts/redis.sh start           - Start Redis container"
    echo "  ./scripts/redis.sh start-with-gui  - Start Redis with GUI manager"
    echo "  ./scripts/redis.sh stop            - Stop Redis container"
    echo "  ./scripts/redis.sh restart         - Restart Redis container"
    echo "  ./scripts/redis.sh status          - Check Redis status"
    echo "  ./scripts/redis.sh logs            - View Redis logs"
    echo "  ./scripts/redis.sh cli             - Connect to Redis CLI"
    echo "  ./scripts/redis.sh flush           - Flush all Redis data"
    echo "  ./scripts/redis.sh help            - Show this help message"
    ;;
esac
