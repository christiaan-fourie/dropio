# Printing Store Web Tool - Project Instructions

## Project Overview

Create a web application for internal use in a printing store, built with Next.js. The tool provides automated layout creation for print jobs such as business cards, canvas wraps, and custom size layouts. The UI features a clean dashboard interface with easy navigation between different print tools.

---

## Core Features

### 1. Automated Image Layout System
- **Input:** Users upload images in common formats (PNG, JPEG, TIFF, PDF).
- **Automatic Layout:**  
  - **Business Cards:** Arrange 9×5 cm cards optimally on A4 or A3 sheets with 1mm spacing between cards.
  - **Canvas Wraps:** Allow wrap-around layouts (e.g., A3 canvas with 3.5cm bleed per side, print on A2).
  - **Custom Size Layout:** Flexible dimensions with automatic optimization across sheets with 1mm spacing.
  - **Double-sided Support:** Generate properly aligned back sheets with horizontal mirroring for duplex printing.
  - **Smart Fitting:** Automatic calculation of items per sheet and total sheets needed.
  - **Smart Orientation:** Automatic detection and rotation of portrait images to optimal orientation.
- **No Design Tools Required:** Template selection, options, and image upload only.

### 2. Professional Print Export
- **Output:** 300dpi, CMYK, print-ready PDFs with proper cut marks.
- **Features:** 
  - Correct sheet sizing with professional margins
  - 1mm spacing handling for easy cutting
  - Cut marks and registration marks
  - Optimized for offset and digital printing
  - Smart orientation detection and automatic rotation

### 3. Modular & Extensible Architecture
- Component-based structure for easy addition of new print products.
- Reusable layout calculation functions.
- Standardized PDF generation pipeline with pdf-lib.
- Internal use only - no authentication or order management.

---

## Current Implementation Status

### ✅ Completed Features
- **Business Card Layout Tool:**
  - Multi-file drag & drop upload with React Dropzone
  - Live layout preview with sheet visualization
  - A4/A3 sheet size support (10 cards on A4, 24 cards on A3)
  - Double-sided printing with proper alignment and mirroring
  - Smart portrait image detection and automatic 90° rotation
  - Sheets management with smart suggestions
  - Professional PDF export with pdf-lib
  - 1mm spacing between cards for easy cutting (no bleed)
  - File management (add/remove individual files)
  - **Streamlined Settings & Upload Interface:**  
    - All print settings (sheet size, sheets, double-sided toggle) and image uploads in a single animated panel
    - Modern glassmorphism design with gradients and micro-interactions
    - Responsive grid layout with animated progress indicators
    - Interactive toggle for print mode with animated transitions
    - Upload zones with animated borders, drag feedback, and file previews

- **Canvas Wrap Layout Tool:**
  - Custom canvas dimensions with thickness and wrap calculations
  - Automatic bleed calculation for gallery wraps
  - Optimal sheet size selection and orientation
  - Professional canvas stretching layouts
  - Clean export with artwork only (no guide lines)

### 🔄 In Progress
- Custom size layout tool
- Enhanced preview system with layout visualization

### 📋 Planned Features
- Multi-format export options
- Advanced cut mark customization
- Batch processing capabilities
- Print estimation tools

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14 with App Router
- **UI Library:** Tailwind CSS for styling
- **Components:** React with TypeScript support
- **File Upload:** react-dropzone for drag & drop
- **Icons:** React Icons (Feather icons, Font Awesome)
- **State Management:** React hooks (useState, useEffect)

### Backend/API
- **API Routes:** Next.js API routes
- **PDF Generation:** pdf-lib for professional PDF creation
- **Image Processing:** Browser-based processing with smart orientation detection
- **File Handling:** FormData API for multipart uploads

### Development Tools
- **Package Manager:** npm
- **Development Server:** Next.js dev server
- **Code Quality:** ESLint configuration

---

## Print Tool Specifications

### Business Cards
- **Dimensions:** 90×50mm (landscape orientation)
- **Layouts:** 
  - A4: 2×5 grid = 10 cards per sheet
  - A3: 3×8 grid = 24 cards per sheet
- **Spacing:** 1mm between cards
- **Bleed:** None (clean cutting lines)
- **Smart Features:** Auto-rotation of portrait images

### Canvas Wraps
- **Presets:** A4 to A0 canvas sizes + custom square formats
- **Bleed Calculation:** Thickness + extra fold allowance
- **Sheet Selection:** Automatic optimal sheet size and orientation
- **Professional Output:** Artwork-only export for canvas stretching

### Custom Size Layout (Planned)
- **Flexible Dimensions:** User-defined width and height
- **Smart Layout:** Automatic grid calculation for optimal sheet usage
- **Spacing:** 1mm between items
- **Double-sided Support:** Mirrored back alignment
- **Orientation Detection:** Auto-rotation for optimal fit

---

## User Interface Design

### Dashboard Layout
- **Sidebar Navigation:** Clean vertical sidebar with tool selection and status indicators
- **Main Content Area:** Tool-specific interfaces with streamlined controls
- **Responsive Design:** Optimized for desktop and tablet devices
- **Visual Feedback:** Loading states, drag indicators, file status, animated transitions

### Tool Interface Standards
- **Streamlined Settings Panel:**  
  - All controls in a single, visually stunning, animated panel
  - Glassmorphism design with animated gradients and blur effects
  - Smart toggles with animated icons and color transitions
  - Live progress indicators and status feedback
- **Smart Upload Zones:** 
  - Animated borders with drag feedback
  - File previews with management controls
  - Multi-file support with overflow handling
- **Live Preview:** Real-time layout calculation and sheet visualization
- **Professional Controls:** Clear validation and comprehensive error handling

---

## Workflow Examples

### Business Card Layout
1. **Upload Images:** Drag & drop front images (auto-detects portrait and rotates)
2. **Configure Settings:** Sheet size (A4/A3), number of sheets, double-sided toggle
3. **Preview Layout:** Live calculation showing 10/24 cards per sheet arrangement
4. **Generate PDF:** Professional output with 1mm spacing and cutting guides
5. **Professional Output:** 300dpi CMYK PDF ready for immediate printing

### Canvas Wrap Layout
1. **Select Canvas Size:** Choose preset or custom dimensions
2. **Configure Wrap:** Set thickness and fold allowances
3. **Upload Artwork:** High-resolution images for canvas printing
4. **Auto-Optimization:** System selects optimal sheet size and orientation
5. **Generate PDF:** Clean artwork export ready for canvas stretching

---

## Code Architecture

### Component Structure
```
app/
├── components/
│   ├── BusinessCards.jsx (Business card layout tool)
│   ├── CanvasWrap.jsx (Canvas wrap tool)
│   ├── CustomSize.jsx (Planned - Custom size layout)
│   └── shared/ (Reusable components)
├── api/
│   ├── generate-business-cards/route.js (Business card PDF generation)
│   ├── generate-canvas-wrap/route.js (Canvas PDF generation)
│   └── generate-custom-size/route.js (Planned)
└── page.js (Main dashboard with tool navigation)
```

### Key Functions
- **calculateLayout():** Optimal arrangement calculation with spacing
- **getSmartImageDimensions():** Portrait detection and rotation logic
- **drawImageWithOrientation():** Smart image placement with rotation
- **processImageForPDF():** Image processing and embedding
- **PDF Generation:** Professional layouts with pdf-lib

---

## Quality Standards

### Print Requirements
- **Resolution:** Minimum 300dpi for all outputs
- **Color Space:** CMYK color profile for professional printing
- **Spacing:** 1mm spacing between all items for easy cutting
- **Cut Marks:** Professional registration and trim guides
- **Orientation:** Smart detection and automatic correction

### Code Quality
- **Modular Design:** Reusable components and layout functions
- **Error Handling:** Comprehensive validation and user feedback
- **Performance:** Optimized image processing and PDF generation
- **Maintainability:** Clear code structure with consistent patterns

---

## Future Roadmap

### Phase 1 (Current)
- ✅ Business card tool with smart orientation
- ✅ Canvas wrap tool
- ✅ Professional PDF output with pdf-lib
- ✅ Dashboard structure with tool navigation

### Phase 2 (Next)
- 🔄 Custom size layout tool
- 🔄 Enhanced preview system with visual layout guides
- 📋 Additional sheet sizes (A2, custom formats)

### Phase 3 (Future)
- 📋 Batch processing capabilities
- 📋 Advanced cut mark customization
- 📋 Print estimation and costing tools
- 📋 Export format options (multi-page, separated files)

---

## Development Notes

- **No Authentication:** Internal tool, no user management needed
- **Browser Compatibility:** Modern browsers supporting ES6+ and Canvas API
- **File Size Limits:** Reasonable limits for print-quality images
- **Performance:** Client-side processing for responsive user experience
- **Smart Features:** Automatic orientation detection reduces user errors
- **Professional Output:** All PDFs optimized for commercial printing workflows

---

**Last Updated:** Now includes smart orientation detection, 1mm spacing system, and updated roadmap focusing on custom size layouts