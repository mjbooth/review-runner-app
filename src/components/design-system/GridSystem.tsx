import * as React from 'react';

/**
 * Review Runner Responsive Grid System
 *
 * A comprehensive grid system that adapts to different screen sizes following
 * Figma design specifications and Tailwind CSS breakpoints.
 *
 * Breakpoint Specifications:
 * - Mobile (≥640px): 4 columns, 16px gap, 16px margins
 * - Tablet (≥768px): 8 columns, 20px gap, 24px margins
 * - Desktop (≥1024px): 12 columns, 24px gap, 32px margins
 * - Large Desktop (≥1280px): 12 columns, 24px gap, 40px margins
 * - Extra Large (≥1440px): 12 columns, 24px gap, 48px margins
 */

interface GridSystemProps {
  showDemo?: boolean;
}

export function GridSystem({ showDemo = false }: GridSystemProps): React.ReactElement {
  if (!showDemo) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Grid System Usage</h2>
        <div className="prose max-w-none">
          <p>The Review Runner responsive grid system is now available. Use these classes:</p>

          <h3>Basic Grid Container</h3>
          <code className="block bg-slate-100 p-3 rounded text-sm mb-4">
            {`<div className="grid-container">
  <div className="col-span-2 md:col-span-4 lg:col-span-6">Content</div>
  <div className="col-span-2 md:col-span-4 lg:col-span-6">Content</div>
</div>`}
          </code>

          <h3>Available Classes</h3>
          <ul>
            <li>
              <strong>.grid-container</strong> - Responsive grid with automatic column counts
            </li>
            <li>
              <strong>.col-span-{'{1-4}'}</strong> - Mobile column spans (1-4 columns)
            </li>
            <li>
              <strong>.md:col-span-{'{1-8}'}</strong> - Tablet column spans (1-8 columns)
            </li>
            <li>
              <strong>.lg:col-span-{'{1-12}'}</strong> - Desktop column spans (1-12 columns)
            </li>
            <li>
              <strong>.col-span-full</strong> - Full width at any breakpoint
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Responsive Grid System Demo</h2>
        <p className="text-slate-600 mb-6">
          Resize your browser to see how the grid adapts across breakpoints.
        </p>
      </div>

      {/* Grid Container Demo */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Basic Grid Container</h3>
        <div className="grid-container mb-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="col-span-1 md:col-span-1 lg:col-span-1 bg-forgedorange-100 border border-forgedorange-300 p-3 text-center text-sm font-medium text-forgedorange-800 rounded"
            >
              {i + 1}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Mobile: 4 columns visible • Tablet: 8 columns visible • Desktop: 12 columns visible
        </p>
      </section>

      {/* Responsive Column Spans */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Responsive Column Spans</h3>
        <div className="grid-container space-y-4">
          <div className="col-span-full bg-basewarm-200 p-4 text-center rounded">
            <strong>Full Width</strong> - col-span-full
          </div>

          <div className="col-span-2 md:col-span-4 lg:col-span-6 bg-basewarm-100 p-4 text-center rounded">
            <strong>Half Width</strong>
            <br />
            <small>Mobile: 2/4 • Tablet: 4/8 • Desktop: 6/12</small>
          </div>
          <div className="col-span-2 md:col-span-4 lg:col-span-6 bg-basewarm-100 p-4 text-center rounded">
            <strong>Half Width</strong>
            <br />
            <small>Mobile: 2/4 • Tablet: 4/8 • Desktop: 6/12</small>
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-forgedorange-50 p-4 text-center rounded border border-forgedorange-200">
            <strong>Quarter</strong>
            <br />
            <small>1/4 • 2/8 • 3/12</small>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-forgedorange-50 p-4 text-center rounded border border-forgedorange-200">
            <strong>Quarter</strong>
            <br />
            <small>1/4 • 2/8 • 3/12</small>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-forgedorange-50 p-4 text-center rounded border border-forgedorange-200">
            <strong>Quarter</strong>
            <br />
            <small>1/4 • 2/8 • 3/12</small>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-forgedorange-50 p-4 text-center rounded border border-forgedorange-200">
            <strong>Quarter</strong>
            <br />
            <small>1/4 • 2/8 • 3/12</small>
          </div>
        </div>
      </section>

      {/* Asymmetric Layout Example */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Asymmetric Layout Example</h3>
        <div className="grid-container">
          <div className="col-span-3 md:col-span-6 lg:col-span-8 bg-white border border-slate-200 p-6 rounded-lg">
            <h4 className="font-semibold text-slate-900 mb-2">Main Content Area</h4>
            <p className="text-slate-600 text-sm">
              This content area adapts: 3/4 width on mobile, 6/8 (3/4) on tablet, 8/12 (2/3) on
              desktop.
            </p>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-slate-50 border border-slate-200 p-6 rounded-lg">
            <h4 className="font-semibold text-slate-900 mb-2">Sidebar</h4>
            <p className="text-slate-600 text-sm">
              Sidebar: 1/4 width on mobile, 2/8 (1/4) on tablet, 4/12 (1/3) on desktop.
            </p>
          </div>
        </div>
      </section>

      {/* Grid Specifications Table */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Grid Specifications</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-slate-200 rounded-lg">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                  Breakpoint
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                  Screen Size
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">Columns</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">Gap</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">Margins</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                  Tailwind Gap
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-white">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">Mobile</td>
                <td className="px-4 py-3 text-sm text-slate-600">≥640px</td>
                <td className="px-4 py-3 text-sm text-slate-600">4</td>
                <td className="px-4 py-3 text-sm text-slate-600">16px</td>
                <td className="px-4 py-3 text-sm text-slate-600">16px</td>
                <td className="px-4 py-3 text-sm text-slate-600">gap-4</td>
              </tr>
              <tr className="bg-slate-25">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">Tablet</td>
                <td className="px-4 py-3 text-sm text-slate-600">≥768px</td>
                <td className="px-4 py-3 text-sm text-slate-600">8</td>
                <td className="px-4 py-3 text-sm text-slate-600">20px</td>
                <td className="px-4 py-3 text-sm text-slate-600">24px</td>
                <td className="px-4 py-3 text-sm text-slate-600">gap-5</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">Desktop</td>
                <td className="px-4 py-3 text-sm text-slate-600">≥1024px</td>
                <td className="px-4 py-3 text-sm text-slate-600">12</td>
                <td className="px-4 py-3 text-sm text-slate-600">24px</td>
                <td className="px-4 py-3 text-sm text-slate-600">32px</td>
                <td className="px-4 py-3 text-sm text-slate-600">gap-6</td>
              </tr>
              <tr className="bg-slate-25">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">Large Desktop</td>
                <td className="px-4 py-3 text-sm text-slate-600">≥1280px</td>
                <td className="px-4 py-3 text-sm text-slate-600">12</td>
                <td className="px-4 py-3 text-sm text-slate-600">24px</td>
                <td className="px-4 py-3 text-sm text-slate-600">40px</td>
                <td className="px-4 py-3 text-sm text-slate-600">gap-6</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">Extra Large</td>
                <td className="px-4 py-3 text-sm text-slate-600">≥1440px</td>
                <td className="px-4 py-3 text-sm text-slate-600">12</td>
                <td className="px-4 py-3 text-sm text-slate-600">24px</td>
                <td className="px-4 py-3 text-sm text-slate-600">48px</td>
                <td className="px-4 py-3 text-sm text-slate-600">gap-6</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
