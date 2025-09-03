# Figma Design Audit & Implementation Guide

## 📋 Visual Audit Checklist

### Context Menu Component (node-id=32-374)

**Compare these elements with Figma:**

#### **Container**

- [ ] Border radius (likely 8px or 12px)
- [ ] Shadow (check for specific drop-shadow values)
- [ ] Border color and thickness
- [ ] Background color (pure white vs off-white)
- [ ] Padding (top/bottom spacing)
- [ ] Width (check min/max width specifications)

#### **Menu Items**

- [ ] Padding (horizontal and vertical spacing)
- [ ] Typography (font family, size, weight, line-height)
- [ ] Icon size (16px, 20px, or 24px)
- [ ] Icon-to-text spacing
- [ ] Text color (normal vs disabled states)
- [ ] Hover background color
- [ ] Focused/selected state styling

#### **Separators**

- [ ] Color (border-gray-100 vs specific hex)
- [ ] Thickness (1px vs 0.5px)
- [ ] Margin (spacing above/below)

#### **Icons**

- [ ] Stroke width (1px, 1.5px, or 2px)
- [ ] Color consistency
- [ ] Size consistency

### Full Dashboard Table (node-id=31-62)

**Compare these elements with Figma:**

#### **Table Container**

- [ ] Background color
- [ ] Border radius
- [ ] Shadow/elevation
- [ ] Padding/margins

#### **Table Rows**

- [ ] Height specifications
- [ ] Border colors and thickness
- [ ] Hover state colors
- [ ] Selection state styling

#### **Scheduled Row Styling**

- [ ] Background color (orange/amber specifications)
- [ ] Hover state for scheduled rows
- [ ] Selection ring interaction with orange background

#### **Typography**

- [ ] Font family (Inter specifications)
- [ ] Font sizes (14px, 16px, etc.)
- [ ] Font weights (400, 500, 600)
- [ ] Line heights
- [ ] Letter spacing

#### **Colors**

- [ ] Primary colors (blues)
- [ ] Secondary colors (grays)
- [ ] Success/error colors
- [ ] Scheduled state color (orange/amber)

## 🎯 Action Items

### Step 1: Document Current vs Expected

1. **Take screenshots** of current implementation
2. **Compare with Figma** designs side by side
3. **List specific differences** (colors, spacing, typography)

### Step 2: Extract Design Tokens

From Figma inspect panel, extract:

- Colors (hex values)
- Typography (font size, weight, line-height)
- Spacing (padding, margin values)
- Border radius values
- Shadow specifications

### Step 3: Update Implementation

Based on differences found, update:

- Context menu styling
- Table row styling
- Typography specifications
- Color values
- Spacing values

## 🔧 Common Figma vs Code Discrepancies

### Typography Issues

- **Font loading**: Ensure Inter font is loaded correctly
- **Font weights**: 400 (normal) vs 500 (medium) vs 600 (semibold)
- **Line heights**: Often specified as unitless values (1.4, 1.5)
- **Letter spacing**: May need negative values (-0.01em)

### Color Issues

- **Color precision**: Use exact hex values from Figma
- **Opacity handling**: Check for transparent overlays
- **State colors**: Hover, focus, disabled states

### Spacing Issues

- **Padding inconsistencies**: px-3 (12px) vs exact Figma values
- **Margin variations**: my-1 (4px) vs specific spacing
- **Gap specifications**: Often different from Tailwind defaults

### Border & Shadow Issues

- **Border radius**: rounded-lg (8px) vs specific values
- **Shadow spread**: Figma shadows often more subtle
- **Border colors**: gray-200 vs specific hex values

## 📝 Design Token Extraction Template

```css
/* Context Menu Design Tokens */
:root {
  /* Extract these from Figma */
  --context-menu-bg: #ffffff;
  --context-menu-border: #e5e7eb;
  --context-menu-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  --context-menu-radius: 8px;
  --context-menu-padding: 4px;

  /* Menu Items */
  --menu-item-padding-x: 12px;
  --menu-item-padding-y: 8px;
  --menu-item-font-size: 14px;
  --menu-item-line-height: 20px;
  --menu-item-gap: 8px;

  /* Colors */
  --menu-item-text: #374151;
  --menu-item-text-disabled: #9ca3af;
  --menu-item-hover-bg: #f3f4f6;
  --menu-item-focus-bg: #ebf5ff;
  --menu-item-focus-text: #1d4ed8;

  /* Icons */
  --menu-icon-size: 16px;
  --menu-icon-color: #6b7280;
  --menu-icon-disabled: #d1d5db;

  /* Separators */
  --separator-color: #f3f4f6;
  --separator-margin: 4px;
}
```

## 🚀 Testing Protocol

1. **Side-by-side comparison**: Open Figma and implementation
2. **Pixel-perfect overlay**: Use browser dev tools to overlay Figma design
3. **Interactive states**: Test hover, focus, disabled states
4. **Cross-browser testing**: Ensure consistency across browsers
5. **Mobile responsive**: Check design adapts correctly

## 📞 Next Steps

To get exact specifications:

1. Share screenshots of current vs expected
2. Use Figma's inspect panel to extract exact values
3. Copy CSS from Figma dev mode
4. Implement design token system for consistency
