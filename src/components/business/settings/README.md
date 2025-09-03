# Business Settings Page

## Overview

A comprehensive business settings page located at `/settings/business` that serves as the central hub for viewing and managing business identity and context within Review Runner.

## Architecture

The page is structured in three primary sections:

### 1. Business Profile Section (`BusinessProfileSection.tsx`)
- **Purpose**: Display Google Places API data as read-only authoritative source
- **Features**:
  - Business name, address, phone, website
  - Business hours and categories
  - Current review statistics (rating, count)
  - Business photos gallery
  - Google Places attribution and refresh timestamps
  - Price level indicator

### 2. Review Request Settings Section (`ReviewRequestSettingsSection.tsx`)
- **Purpose**: Configure how review requests are sent and managed
- **Features**:
  - Email and SMS template previews with personalization tokens
  - Business hours enforcement settings
  - Follow-up campaign configuration
  - Default communication channel selection
  - Suppression list management
  - "Coming Soon" indicators for v1 features

### 3. Data Sync Panel (`DataSyncPanel.tsx`)
- **Purpose**: Manage Google Places API synchronization
- **Features**:
  - Real-time sync status indicators
  - Manual refresh capabilities
  - API usage tracking
  - Error handling and retry logic
  - Detailed sync information dropdown

## Key Design Principles

### Information Hierarchy
- Google Places data takes precedence as "source of truth"
- Business context positioned as enhancement layers
- Clear visual distinction between read-only and configurable elements

### Progressive Enhancement
- v1: Core functionality with "Coming Soon" indicators
- Clear roadmap progression indicators
- Context collection for future feature enablement

### User Experience
- Comprehensive loading states and error handling
- Professional styling consistent with design system
- Mobile-responsive layouts
- Intuitive navigation and status indicators

## File Structure

```
src/components/business/settings/
├── BusinessSettingsPage.tsx      # Main page container
├── BusinessProfileSection.tsx    # Google Places data display
├── ReviewRequestSettingsSection.tsx  # Review settings management
├── DataSyncPanel.tsx             # Sync status and controls
└── README.md                     # This documentation
```

## Integration Points

### API Endpoints Used
- `GET /api/businesses/current` - Fetch business data
- `POST /api/businesses/refresh-google-data` - Refresh Google Places data

### Dependencies
- React hooks for state management
- Custom UI components (LoadingSpinner, ErrorBoundary)
- Existing design system (Tailwind CSS classes)
- Google Places API integration

### Navigation
- Route: `/settings/business`
- Page wrapper: `src/app/settings/business/page.tsx`

## Future Enhancements

### v2 Features
- Template customization capabilities
- Advanced timing and scheduling options
- Industry-specific template recommendations

### v3 Features
- Full suppression list management
- Advanced analytics and reporting
- Compliance automation tools

## Testing

The page includes comprehensive error handling:
- Loading states for async operations
- Error boundaries for component failures
- Graceful degradation for missing data
- Retry mechanisms for failed operations

## Styling

Uses consistent design patterns:
- Tailwind CSS for styling
- Custom color scheme (forgedorange, charcoal)
- Responsive grid layouts
- Professional card-based UI components