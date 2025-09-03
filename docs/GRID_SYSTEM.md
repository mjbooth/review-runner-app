# Review Runner Responsive Grid System

A comprehensive responsive grid system that aligns with Figma design specifications and Tailwind CSS breakpoints.

## Grid Specifications

| Breakpoint | Screen Size | Columns | Gap | Margins | Tailwind Gap |
|------------|-------------|---------|-----|---------|--------------|
| Mobile | ≥640px | 4 | 16px | 16px | gap-4 |
| Tablet | ≥768px | 8 | 20px | 24px | gap-5 |
| Desktop | ≥1024px | 12 | 24px | 32px | gap-6 |
| Large Desktop | ≥1280px | 12 | 24px | 40px | gap-6 |
| Extra Large | ≥1440px | 12 | 24px | 48px | gap-6 |

## Usage

### Basic Grid Container

```html
<div class="grid-container">
  <div class="col-span-2 md:col-span-4 lg:col-span-6">Content</div>
  <div class="col-span-2 md:col-span-4 lg:col-span-6">Content</div>
</div>
```

### Available Classes

#### Container
- `.grid-container` - Responsive grid with automatic column counts and proper margins/gaps

#### Column Spans
- `.col-span-{1-4}` - Mobile column spans (1-4 columns)
- `.md:col-span-{1-8}` - Tablet column spans (1-8 columns) 
- `.lg:col-span-{1-12}` - Desktop column spans (1-12 columns)
- `.col-span-full` - Full width at any breakpoint

## Examples

### Responsive Card Grid

```html
<div class="grid-container">
  <!-- Cards adapt: 1 per row on mobile, 2 per row on tablet, 3 per row on desktop -->
  <div class="col-span-4 md:col-span-4 lg:col-span-4">Card 1</div>
  <div class="col-span-4 md:col-span-4 lg:col-span-4">Card 2</div>
  <div class="col-span-4 md:col-span-4 lg:col-span-4">Card 3</div>
</div>
```

### Asymmetric Layout

```html
<div class="grid-container">
  <!-- Main content: 3/4 width on mobile, 3/4 on tablet, 2/3 on desktop -->
  <main class="col-span-3 md:col-span-6 lg:col-span-8">
    Main content area
  </main>
  
  <!-- Sidebar: 1/4 width on mobile, 1/4 on tablet, 1/3 on desktop -->
  <aside class="col-span-1 md:col-span-2 lg:col-span-4">
    Sidebar content
  </aside>
</div>
```

### Dashboard Layout

```html
<div class="grid-container">
  <!-- Header spans full width -->
  <header class="col-span-full">
    Dashboard Header
  </header>
  
  <!-- Metrics cards: 1 per row mobile, 2 per row tablet, 4 per row desktop -->
  <div class="col-span-4 md:col-span-4 lg:col-span-3">Metric 1</div>
  <div class="col-span-4 md:col-span-4 lg:col-span-3">Metric 2</div>
  <div class="col-span-4 md:col-span-4 lg:col-span-3">Metric 3</div>
  <div class="col-span-4 md:col-span-4 lg:col-span-3">Metric 4</div>
  
  <!-- Main table spans full width -->
  <div class="col-span-full">
    Data Table
  </div>
</div>
```

## Migration from Legacy Grid

### Before (Legacy)
```html
<div class="grid-12-col">
  <div class="col-span-12 sm:col-span-6 lg:col-span-4">Item</div>
</div>
```

### After (New System)
```html
<div class="grid-container">
  <div class="col-span-4 md:col-span-4 lg:col-span-4">Item</div>
</div>
```

## Backward Compatibility

The system maintains backward compatibility with existing classes:
- `.grid-12-col` → Maps to new grid system
- `.container-1440` → Maps to new grid container

## Technical Implementation

### CSS Custom Properties
The grid system is implemented using CSS Grid with responsive breakpoints:

```css
.grid-container {
  display: grid;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  
  /* Mobile: 4 columns, 16px gap */
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 768px) {
  .grid-container {
    /* Tablet: 8 columns, 20px gap */
    grid-template-columns: repeat(8, 1fr);
    gap: 1.25rem;
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}
```

### Tailwind Config Extension
```js
gridTemplateColumns: {
  'mobile': 'repeat(4, 1fr)',
  'tablet': 'repeat(8, 1fr)', 
  'desktop': 'repeat(12, 1fr)',
}
```

## Best Practices

1. **Always use `.grid-container`** as the parent element
2. **Specify column spans for each breakpoint** to ensure proper responsive behavior
3. **Use `.col-span-full`** for elements that should span the entire width
4. **Consider content hierarchy** when choosing column spans
5. **Test across all breakpoints** to ensure optimal user experience

## Demo Component

Import and use the demo component to visualize the grid system:

```tsx
import { GridSystem } from '@/components/design-system/GridSystem';

<GridSystem showDemo={true} />
```