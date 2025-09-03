# New Create Review Request Modal Design Specifications

Based on the Figma design, here are the key changes and specifications for the new modal design:

## Overall Layout Changes

### Modal Structure
- **Simplified 3-step process** clearly displayed on the left side:
  1. Select a template
  2. Edit the message
  3. Schedule and send
- **Customer information** displayed in a card at the top left
- **Main content area** on the right for template selection

### Visual Design
- **Cleaner, more minimal aesthetic**
- **White background** throughout (no gray backgrounds)
- **Reduced visual hierarchy** - less emphasis on borders and sections
- **Orange accent color** for active steps and primary actions

## Step 1: Template Selection

### Search and Filters
- **Search bar** at the top: "Search for a template"
- **Channel filters** as checkboxes on the right:
  - "All Channels" 
  - "Email" (checkbox)
  - "SMS" (checkbox)
- No category filters visible (removed complexity)

### Template Display
- **Templates grouped by channel**: "Email Templates [6]" and "SMS Templates [6]"
- **Count displayed** next to each channel heading
- **Template cards** show:
  - Checkbox for selection (not the whole card clickable)
  - Template title
  - Preview text (2-3 lines)
  - "System template" or "User template" label on the right
  - Tags/badges for template type (e.g., "Initial Request")

### Template Card Design
- **White cards** with subtle borders
- **No hover effects** visible
- **Checkbox selection** instead of full card selection
- **More compact** presentation

## Customer Information Display
- **Gray background card** in top left
- Shows:
  - First name
  - Second name  
  - email@address.com
  - Phone number
- **More compact** than current implementation

## Navigation and Actions
- **Step indicators** on the left with:
  - Orange checkmark for completed steps
  - Orange circle for current step
  - Gray circle for upcoming steps
- **No visible action buttons** in this view (likely at bottom of modal)

## Key Differences from Current Implementation

1. **Simplified filters**: Just channel checkboxes instead of complex filter bar
2. **Checkbox selection**: Templates selected via checkbox, not full card click
3. **Template labeling**: Clear distinction between system and user templates
4. **Cleaner cards**: Less visual emphasis, no colored borders or backgrounds
5. **Step progress**: More prominent step indicators on the left
6. **Search prominence**: Search bar is more prominent at the top
7. **Template counts**: Shows number of templates per channel
8. **Compact customer info**: Smaller, simpler customer information display

## Typography and Spacing
- **Larger, bolder headings** for channel sections
- **More whitespace** between elements
- **Consistent padding** in cards
- **Sans-serif font** throughout

## Color Scheme
- **Primary**: Orange (#FF6B35 or similar) for active elements
- **Text**: Dark gray/black for primary text
- **Secondary text**: Medium gray for preview text
- **Backgrounds**: White for cards, light gray for customer info
- **Borders**: Very light gray

## Implementation Notes

### Component Updates Needed
1. Redesign template selection to use checkboxes
2. Update filter bar to simple channel checkboxes
3. Add template type labels (system/user)
4. Implement new step indicator design
5. Update card styling to be more minimal
6. Add template counts to channel headings

### State Management Changes
1. Track selected templates via checkbox state
2. Simplify filter state to just channel selection
3. Remove category filter complexity

### Accessibility Considerations
1. Ensure checkboxes are properly labeled
2. Maintain keyboard navigation for template selection
3. Keep focus management for step transitions
4. Ensure sufficient color contrast for all text

## Mobile Considerations
- Stack layout vertically on mobile
- Customer info above template selection
- Simplified step indicators
- Full-width template cards