# Printing Store Web Tool - Project Instructions

## Project Overview

Create a web application for internal use in a printing store, built with Next.js. The tool provides automated layout creation for print jobs such as business cards and canvas wraps. The UI features a clean dashboard interface with easy navigation between different print tools.

---

## Core Features

### 1. Automated Image Layout System
- **Input:** Users upload images in common formats (PNG, JPEG, TIFF, PDF).
- **Automatic Layout:**  
  - **Business Cards:** Arrange 9×5 cm cards optimally on A4 or A3 sheets with 3mm bleed per card.
  - **Double-sided Support:** Generate properly aligned back sheets with horizontal mirroring for duplex printing.
  - **Canvas Wraps:** Allow wrap-around layouts (e.g., A3 canvas with 3.5 cm bleed per side, print on A2).
  - **Smart Fitting:** Automatic calculation of cards per sheet and total sheets needed.
- **No Design Tools Required:** Template selection, options, and image upload only.

### 2. Professional Print Export
- **Output:** 300dpi, CMYK, print-ready PDFs with proper cut marks.
- **Features:** 
  - Correct sheet sizing with professional margins
  - Bleed handling for trim-safe printing
  - Cut marks and registration marks
  - Optimized for offset and digital printing

### 3. Modular & Extensible Architecture
- Component-based structure for easy addition of new print products.
- Reusable layout calculation functions.
- Standardized PDF generation pipeline.
- Internal use only - no authentication or order management.

---

## Current Implementation Status

### ✅ Completed Features
- **Business Card Layout Tool:**
  - Multi-file drag & drop upload with React Dropzone
  - Live layout preview with sheet visualization
  - A4/A3 sheet size support
  - Double-sided printing with proper alignment
  - Quantity management with smart suggestions
  - Professional PDF export with jsPDF
  - Cut marks and bleed handling
  - File management (add/remove individual files)
  - **Insane Streamlined Settings & Upload Section:**  
    - All print settings (sheet size, sheets, double-sided toggle) and image uploads are now grouped in a single, visually stunning, animated panel.
    - Modern glassmorphism, gradients, and animated feedback for every state.
    - Responsive grid layout for settings and uploads, with animated progress indicators.
    - Interactive toggle for print mode with animated icon and color transitions.
    - Upload zones feature animated borders, drag feedback, and file previews.

### 🔄 In Progress
- Canvas wrap layout tool
- Enhanced preview system
- Additional sheet sizes

### 📋 Planned Features
- Flyer layout tool
- Poster layout system
- Multi-format export options
- Advanced cut mark customization

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14 with App Router
- **UI Library:** Tailwind CSS for styling
- **Components:** React with TypeScript support
- **File Upload:** react-dropzone for drag & drop
- **Icons:** React Icons (Feather icons)
- **State Management:** React hooks (useState, useEffect)

### Backend/API
- **API Routes:** Next.js API routes
- **PDF Generation:** jsPDF for browser-compatible PDF creation
- **Image Processing:** Browser-based base64 conversion
- **File Handling:** FormData API for multipart uploads

### Development Tools
- **Package Manager:** npm
- **Development Server:** Next.js dev server
- **Code Quality:** ESLint configuration

---

## User Interface Design

### Dashboard Layout
- **Sidebar Navigation:** Clean vertical sidebar with tool selection
- **Main Content Area:** Tool-specific interfaces with drag & drop zones
- **Responsive Design:** Works on desktop and tablet devices
- **Visual Feedback:** Loading states, drag indicators, file status

### Business Card Interface
- **Insane Streamlined Settings & Upload Panel:**  
  - All controls (sheet size, sheets, double-sided toggle) and image uploads are in a single, animated, glassy panel.
  - Animated gradients, blur, and micro-interactions for a premium feel.
  - Toggle for print mode with animated icon and color transitions.
  - Upload zones with animated borders, drag feedback, and file previews.
  - Live progress indicators for upload, settings, and PDF readiness.
- **Live Preview:** Real-time layout calculation and sheet preview
- **Professional Controls:** Clear validation messages and error handling

---

## Workflow Example: Business Card Layout

1. **Upload Images:** Drag & drop or click to select front images (and back if double-sided)
2. **Configure Settings:**
   - Select sheet size (A4/A3)
   - Set number of sheets (auto-suggested based on uploaded files)
   - Enable double-sided if needed (animated toggle)
3. **Preview Layout:** View live calculation of cards per sheet and total sheets
4. **Generate PDF:** Download print-ready PDF with proper cut marks and alignment
5. **Professional Output:** 300dpi CMYK PDF ready for printing

---

## Code Architecture

### Component Structure
```
app/
├── components/
│   ├── BusinessCards.jsx (Main business card tool)
│   ├── Sidebar.jsx (Navigation component)
│   └── Layout.jsx (Dashboard wrapper)
├── api/
│   └── generate-business-cards/
│       └── route.js (PDF generation endpoint)
└── page.js (Main dashboard)
```

### Key Functions
- **calculateLayout():** Optimal card arrangement calculation
- **processImageForPDF():** Image to base64 conversion
- **PDF Generation:** Professional layout with cut marks and bleed

---

## Quality Standards

### Print Requirements
- **Resolution:** Minimum 300dpi for all outputs
- **Color Space:** CMYK color profile for professional printing
- **Bleed:** 3mm bleed on all print products
- **Cut Marks:** Professional registration and trim marks

### Code Quality
- **Modular Design:** Reusable components and functions
- **Error Handling:** Comprehensive validation and user feedback
- **Performance:** Optimized image processing and PDF generation
- **Maintainability:** Clear code structure and documentation

---

## Future Roadmap

### Phase 1 (Current)
- Complete business card tool
- Basic dashboard structure
- Professional PDF output

### Phase 2 (Next)
- Canvas wrap tool implementation
- Enhanced preview system
- Additional sheet sizes (A2, custom)

### Phase 3 (Future)
- Flyer and poster tools
- Batch processing capabilities
- Advanced cut mark options
- Print estimation tools

---

## Development Notes

- **No Authentication:** Internal tool, no user management needed
- **Browser Compatibility:** Modern browsers supporting ES6+ and Canvas API
- **File Size Limits:** Reasonable limits for print-quality images
- **Performance:** Client-side processing for responsive user experience

---

**Last Updated:** Now includes the new "insane" streamlined settings & upload panel and