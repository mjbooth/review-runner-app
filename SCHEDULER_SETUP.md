# 📅 Scheduled Sending Setup Guide

## 🎯 **Current Status: FULLY IMPLEMENTED** ✅

The scheduled sending feature is **completely built and ready to use**. Here's what's working:

### ✅ **What's Already Built**
- **UI Components**: Complete scheduling interface with date/time picker ✅
- **Database Schema**: `scheduledFor` field in ReviewRequest model ✅
- **API Endpoints**: Full CRUD for scheduled messages ✅
- **Job Queue Logic**: BullMQ integration with proper delay calculations ✅
- **Background Worker**: Scheduler processor ready to run ✅
- **Management Interface**: Full scheduled messages dashboard ✅

### 🚀 **How It Currently Works**

1. **Creating Scheduled Messages:**
   - User selects customers and creates review request
   - Chooses "Schedule" instead of "Send Now"
   - Picks date and time (validates business hours)
   - System queues job with delay: `scheduledFor.getTime() - Date.now()`

2. **Job Processing:**
   - Jobs are queued in Redis with calculated delay
   - Background worker processes jobs when delay expires
   - Messages are sent via SendGrid/Twilio at scheduled time

### 🔧 **Setup Requirements**

#### 1. **Redis Server** (Required for background jobs)
```bash
# Option A: Using Docker (Recommended)
docker run -d --name redis -p 6379:6379 redis:redis-stack

# Option B: Local Redis installation
brew install redis
redis-server

# Option C: Cloud Redis (Upstash, AWS ElastiCache, etc.)
# Set REDIS_URL environment variable
```

#### 2. **Environment Variables**
```bash
# Add to .env.local
REDIS_URL=redis://localhost:6379
# OR for cloud Redis:
# REDIS_URL=redis://your-cloud-redis-url
```

#### 3. **Start Background Worker**
```bash
# In a separate terminal (keep running)
npm run scheduler

# You should see:
# 🚀 Starting Review Runner Scheduler Worker...
# ✅ Scheduler worker ready - waiting for scheduled jobs...
```

### 🎮 **Testing the Complete Flow**

1. **Start all services:**
   ```bash
   # Terminal 1: Main app
   npm run dev
   
   # Terminal 2: Background scheduler
   npm run scheduler
   ```

2. **Create a scheduled message:**
   - Go to Dashboard → Select customers
   - Click "Send Review Request"
   - Choose "Schedule" and set time 2 minutes from now
   - Submit the form

3. **Monitor the process:**
   - Check "Scheduled Messages" page - should show pending message
   - Wait for scheduled time
   - Check worker terminal - should show job processing
   - Refresh scheduled messages - should be gone (sent)

### 📊 **Production Deployment**

#### **Vercel/Netlify (Frontend)**
```bash
npm run build
npm run start
```

#### **Background Worker (Separate Process)**
- Deploy scheduler to Railway, Render, or similar
- Or run on VPS with PM2:
```bash
pm2 start scheduler-worker.js --name "review-runner-scheduler"
pm2 save
pm2 startup
```

#### **Database & Redis**
- **Database**: Supabase (already configured)
- **Redis**: Upstash Redis (free tier available)

### 🎯 **Current Implementation Status**

| Feature | Status | Notes |
|---------|--------|-------|
| UI Components | ✅ Complete | Date/time picker with validation |
| Database Schema | ✅ Complete | `scheduledFor` field ready |
| API Endpoints | ✅ Complete | Full CRUD operations |
| Job Queueing | ✅ Complete | Proper delay calculations |
| Background Worker | ✅ Complete | Redis-based job processing |
| Message Sending | ✅ Complete | SendGrid integration |
| Management UI | ✅ Complete | View/edit/cancel scheduled messages |
| Navigation | ✅ Complete | "Scheduled Messages" in menu |

### 🚦 **Ready for Production**

The scheduled sending feature is **production-ready**. The only requirement is:

1. **Redis server** for job queue
2. **Background worker process** running

Everything else is fully implemented and tested.

### 📋 **Quick Start (5 minutes)**

```bash
# 1. Start Redis (if you have Docker)
docker run -d --name redis -p 6379:6379 redis:redis-stack

# 2. Start the app
npm run dev

# 3. Start the scheduler (new terminal)
npm run scheduler

# 4. Test it
# - Create a scheduled message for 2 minutes from now
# - Watch it get processed automatically
```

The feature is **complete and ready to use** - you just need Redis running to handle the background job processing! 🎉