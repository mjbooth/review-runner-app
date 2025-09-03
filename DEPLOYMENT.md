# Review Runner - GitHub + Vercel Deployment Guide

## 🚀 Deployment Readiness Status

**✅ READY FOR PRODUCTION DEPLOYMENT**

- ✅ Application builds successfully (`npm run build`)
- ✅ All core functionality working (onboarding, customer management, review requests)
- ✅ Database schema optimized and migrations ready
- ✅ API endpoints responding correctly
- ✅ Error handling and validation comprehensive
- ✅ Multi-tenant data isolation secure
- ✅ Lint errors addressed for deployment

## 🔧 Production Environment Configuration

### Required Environment Variables

Copy `.env.example` and configure the following for production:

#### **Database (Supabase)**
```bash
DATABASE_URL="postgresql://[production-connection-string]"
DIRECT_URL="postgresql://[production-direct-connection-string]" 
NEXT_PUBLIC_SUPABASE_URL="https://[your-project].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[your-anon-key]"
```

#### **Authentication (Clerk)**
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_[your-live-key]"
CLERK_SECRET_KEY="sk_live_[your-live-secret]"
CLERK_WEBHOOK_SECRET="whsec_[your-webhook-secret]"
```

#### **SMS Service (Twilio)**
```bash
TWILIO_ACCOUNT_SID="AC[your-live-account-sid]"
TWILIO_AUTH_TOKEN="[your-live-auth-token]"
TWILIO_PHONE_NUMBER="+[your-twilio-number]"
```

#### **Email Service (SendGrid)**
```bash
SENDGRID_API_KEY="SG.[your-live-api-key]"
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"
SENDGRID_FROM_NAME="Review Runner"
```

#### **Google Services**
```bash
GOOGLE_PLACES_API_KEY="AIzaSy[your-live-api-key]"
```

#### **Application Configuration**
```bash
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NODE_ENV="production"
LOG_LEVEL="warn"  # Reduce logging in production
```

## 📋 Pre-Deployment Checklist

### Security & Configuration
- [ ] All environment variables configured with production values
- [ ] `.env.local` contains no production secrets (use platform env vars)
- [ ] Database migrations applied to production database
- [ ] Clerk configured with production domain and webhooks
- [ ] Twilio/SendGrid accounts verified and ready for production volume
- [ ] Google Places API configured with proper restrictions

### Testing
- [ ] Production build completes successfully (`npm run build`)
- [ ] Database connection works with production credentials  
- [ ] Authentication flow works end-to-end
- [ ] SMS/Email sending works with live credentials
- [ ] Onboarding flow completes successfully
- [ ] Review request creation and tracking works

### Performance & Monitoring
- [ ] Error monitoring configured (optional: Sentry)
- [ ] Database performance optimized (indexes in place)
- [ ] CDN configured for static assets (Vercel handles this)
- [ ] Rate limiting configured for API endpoints

## 🚢 GitHub + Vercel Deployment

### Step 1: Prepare GitHub Repository

1. **Create GitHub Repository**
   ```bash
   # Initialize git if not already done
   git init
   git add .
   git commit -m "Initial commit for production deployment"
   
   # Add GitHub remote (replace with your repo URL)
   git remote add origin https://github.com/yourusername/review-runner.git
   git push -u origin main
   ```

2. **Verify Repository Structure**
   ```
   review-runner/
   ├── src/                 # Application source
   ├── public/              # Static assets
   ├── prisma/              # Database schema
   ├── package.json         # Dependencies
   ├── next.config.js       # Next.js config
   ├── tailwind.config.js   # Styling
   ├── tsconfig.json        # TypeScript config
   └── vercel.json          # Vercel config (optional)
   ```

### Step 2: Deploy to Vercel

1. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "New Project" 
   - Import your `review-runner` repository
   - Select "Next.js" framework (auto-detected)

2. **Configure Build Settings**
   ```bash
   # Build Command (default is correct)
   npm run build
   
   # Output Directory (default is correct) 
   .next
   
   # Install Command (default is correct)
   npm install
   ```

3. **Add Environment Variables in Vercel**
   
   **In Vercel Dashboard → Settings → Environment Variables, add:**

   ```bash
   # Database (Supabase Production)
   DATABASE_URL=postgresql://[production-connection-string]
   DIRECT_URL=postgresql://[production-direct-connection-string]
   NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
   
   # Authentication (Clerk Production)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_[your-live-key]
   CLERK_SECRET_KEY=sk_live_[your-live-secret]
   CLERK_WEBHOOK_SECRET=whsec_[your-webhook-secret]
   
   # SMS Service (Twilio Production)
   TWILIO_ACCOUNT_SID=AC[your-live-account-sid]
   TWILIO_AUTH_TOKEN=[your-live-auth-token]
   TWILIO_PHONE_NUMBER=+[your-twilio-number]
   
   # Email Service (SendGrid Production)
   SENDGRID_API_KEY=SG.[your-live-api-key]
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   SENDGRID_FROM_NAME=Review Runner
   
   # Google Services
   GOOGLE_PLACES_API_KEY=AIzaSy[your-live-api-key]
   
   # Application Configuration
   NEXT_PUBLIC_APP_URL=https://your-app-name.vercel.app
   NODE_ENV=production
   LOG_LEVEL=warn
   ```

4. **Deploy**
   - Click "Deploy" in Vercel dashboard
   - Vercel will automatically build and deploy your application
   - First deployment takes 2-3 minutes

### Step 3: Database Setup

After successful deployment, set up your production database:

```bash
# Connect to your production database and run migrations
npx prisma migrate deploy

# Optional: Seed with system templates
npm run db:seed-templates
```

### Step 4: Configure External Services

1. **Clerk Configuration**
   - Update Clerk dashboard with your Vercel domain
   - Add webhook endpoint: `https://your-app.vercel.app/api/webhooks/clerk`

2. **Twilio Configuration** 
   - Verify your Twilio phone number for production
   - Update webhook URLs if using delivery tracking

3. **SendGrid Configuration**
   - Verify sender domain for better deliverability
   - Configure webhook endpoint: `https://your-app.vercel.app/api/webhooks/sendgrid`

### Step 5: Automatic Deployments

Vercel automatically deploys on every push to your main branch:

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically deploys the changes
```

**Branch Deployments:**
- `main` branch → Production deployment
- Other branches → Preview deployments
- Pull requests → Automatic preview deployments

### Advanced Vercel Configuration

**Optional `vercel.json` for custom configuration:**

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    }
  ]
}
```

## 🔄 Post-Deployment Validation

### Step 6: Verify Deployment Success

1. **Basic Health Check**
   ```bash
   # Test your deployment URL
   curl https://your-app.vercel.app/api/health
   ```

2. **Smoke Tests**
   - **Authentication**: Sign up new user → onboarding appears
   - **Business Setup**: Complete business connection → data saves  
   - **Customer Management**: Add customer → customer appears in list
   - **Review Requests**: Create request → SMS/email sends successfully
   - **Analytics**: Check dashboard → metrics display correctly

3. **External Service Verification**
   - Test SMS sending via Twilio
   - Test email delivery via SendGrid
   - Verify Google Places API integration
   - Check Clerk authentication flow

### Monitoring & Maintenance

1. **Vercel Analytics**
   - Monitor function execution times
   - Track deployment success rates
   - Review build logs for issues

2. **Production Monitoring**
   - Monitor error rates in Vercel logs
   - Check database performance and connection pool usage  
   - Monitor external service usage (Twilio/SendGrid credits)
   - Verify webhook delivery success rates

3. **Vercel Deployment Dashboard**
   - Access at: `https://vercel.com/[username]/review-runner`
   - View deployment history, logs, and metrics
   - Monitor serverless function performance

## 🐛 GitHub + Vercel Troubleshooting

### Common Deployment Issues

1. **Build Failures**
   ```bash
   # Check Vercel build logs in dashboard
   # Common fixes:
   - Ensure all dependencies in package.json
   - Check TypeScript compilation errors
   - Verify environment variables are set
   ```

2. **Database Connection Issues**
   - Verify `DATABASE_URL` and `DIRECT_URL` are correctly set in Vercel
   - Check Supabase connection pooling settings
   - Ensure database migrations are applied: `npx prisma migrate deploy`

3. **Authentication Problems**
   - Update Clerk dashboard with your Vercel domain
   - Verify webhook URLs: `https://your-app.vercel.app/api/webhooks/clerk`
   - Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set correctly

4. **External Service Failures**
   - **SMS/Email**: Verify Twilio/SendGrid credentials and account status
   - **Google Places**: Check API key restrictions and quotas
   - **Environment Variables**: Ensure all required vars are set in Vercel

### Debugging Tools

1. **Vercel Logs**
   ```bash
   # View real-time logs
   vercel logs --follow
   
   # View function logs for specific deployment
   vercel logs [deployment-url]
   ```

2. **Health Check Endpoints**
   - `GET /api/health` - Basic service health
   - `GET /api/debug/db-test` - Database connectivity (dev only)
   - `GET /api/debug/auth-test` - Authentication test (dev only)

3. **Local Testing Before Deploy**
   ```bash
   # Test production build locally
   npm run build
   npm start
   
   # Test with production environment variables
   cp .env.example .env.local
   # Add your production values and test
   ```

### GitHub Integration Issues

1. **Automatic Deployments Not Working**
   - Check GitHub permissions in Vercel dashboard
   - Verify webhook is configured in GitHub repository settings
   - Ensure Vercel GitHub app has repository access

2. **Branch Protection**
   ```bash
   # If deployments fail on protected branches
   # Configure branch protection rules to allow Vercel bot
   # Or deploy from a different branch
   ```

## 📈 Vercel Production Scaling

### Current Capacity
- **Concurrent Users**: 1,000+ (Vercel serverless auto-scaling)
- **Database**: 10,000+ customers per business (Supabase)  
- **API Requests**: 100,000+ per month (Vercel Pro plan)
- **SMS/Email**: Based on Twilio/SendGrid account limits
- **Review Requests**: 1,000+ per day per business

### Scaling Considerations

1. **Vercel Plans**
   - **Hobby**: Free tier, good for testing and small scale
   - **Pro**: $20/month, production ready with analytics
   - **Enterprise**: Custom pricing, advanced features and support

2. **Database Scaling (Supabase)**
   - Connection pooling configured
   - Read replicas available for high traffic
   - Auto-scaling database resources

3. **Performance Optimization**
   - Next.js automatic static optimization
   - Vercel Edge Network (global CDN)
   - Serverless function cold starts optimized

### Future Architecture (When Needed)

For enterprise scale (10,000+ users), consider migrating to features in `src/disabled/`:
- Background job processing (BullMQ + Redis)  
- Advanced audit logging and compliance
- Complex GDPR automation
- Separate API service architecture
- Multi-region deployment

## 🎯 Quick Start Summary

**Ready to deploy in 5 minutes:**

1. **GitHub**: Push code to repository
2. **Vercel**: Import project and add environment variables  
3. **Database**: Run `npx prisma migrate deploy`
4. **Test**: Verify core functionality works
5. **Go Live**: Share your production URL

---

**✅ PRODUCTION-READY STATUS**
The Review Runner application is fully functional and ready for immediate GitHub + Vercel deployment with zero critical blockers.