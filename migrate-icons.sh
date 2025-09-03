#!/bin/bash

# 🎯 Icon Migration Script - Lucide → Custom SVG Components
# This script helps migrate from lucide-react to custom SVG icons

echo "🎯 Starting Icon Migration from Lucide React to Custom SVG Components..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check current status
echo -e "\n${BLUE}📊 Current Status:${NC}"
LUCIDE_FILES=$(find src -name "*.tsx" -exec grep -l "from 'lucide-react'" {} \; | wc -l | tr -d ' ')
echo "Files using lucide-react: $LUCIDE_FILES"

if [ "$LUCIDE_FILES" -eq 0 ]; then
    echo -e "${GREEN}✅ No lucide-react imports found! Migration may already be complete.${NC}"
    exit 0
fi

# Step 2: List files that need migration
echo -e "\n${YELLOW}📋 Files that need migration:${NC}"
find src -name "*.tsx" -exec grep -l "from 'lucide-react'" {} \;

# Step 3: Ask for confirmation
echo -e "\n${YELLOW}⚠️  This will modify import statements in $LUCIDE_FILES files.${NC}"
read -p "Do you want to proceed? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Migration cancelled.${NC}"
    exit 1
fi

# Step 4: Create backups and perform migration
echo -e "\n${BLUE}🔄 Performing migration...${NC}"

# Create backup
echo "Creating backups..."
find src -name "*.tsx" -exec grep -l "from 'lucide-react'" {} \; -exec cp {} {}.lucide-backup \;

# Perform the replacement
echo "Updating import statements..."
find src -name "*.tsx" -exec sed -i.tmp "s/from 'lucide-react'/from '@\/components\/ui\/icons'/g" {} \;

# Clean up temporary files
find src -name "*.tmp" -delete

# Step 5: Verify migration
echo -e "\n${BLUE}✅ Verifying migration...${NC}"
REMAINING_IMPORTS=$(find src -name "*.tsx" -exec grep -l "from 'lucide-react'" {} \; | wc -l | tr -d ' ')

if [ "$REMAINING_IMPORTS" -eq 0 ]; then
    echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    echo -e "All lucide-react imports have been replaced with custom icons."
else
    echo -e "${YELLOW}⚠️  Warning: $REMAINING_IMPORTS files still have lucide-react imports${NC}"
    echo "These may need manual review:"
    find src -name "*.tsx" -exec grep -l "from 'lucide-react'" {} \;
fi

# Step 6: Next steps
echo -e "\n${BLUE}📋 Next Steps:${NC}"
echo "1. Test your application: npm run dev"
echo "2. Run type check: npm run type-check"  
echo "3. Build the project: npm run build"
echo "4. If everything works, remove lucide-react: npm uninstall lucide-react"
echo "5. Remove backup files: find src -name '*.lucide-backup' -delete"

echo -e "\n${GREEN}🎉 Icon migration script completed!${NC}"
echo -e "Check the ${BLUE}ICON_MIGRATION_GUIDE.md${NC} for detailed information."