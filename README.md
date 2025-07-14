# Printing Store Web Tool

This is an internal web application for print shops, built with [Next.js](https://nextjs.org) and [Tailwind CSS](https://tailwindcss.com/). The tool automates professional print layout creation for products like business cards and canvas wraps, providing a clean dashboard interface for fast, error-free print job setup.

## Features

- **Automated Layouts:** Upload images and generate optimal print-ready layouts for business cards (with bleed, cut marks, and duplex support) and canvas wraps.
- **Professional PDF Export:** Download 300dpi, CMYK, print-ready PDFs with cut marks, registration marks, and proper bleed.
- **Live Preview:** Instantly visualize sheet layouts and card arrangements before exporting.
- **Easy Navigation:** Dashboard with sidebar navigation for switching between print tools.
- **No Design Tools Needed:** Just upload images, select options, and export.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the main dashboard by modifying `app/page.js`. The page auto-updates as you edit the file.

## Project Structure

- `app/components/BusinessCards.jsx` – Business card layout tool
- `app/components/Sidebar.jsx` – Dashboard navigation
- `app/api/generate-business-cards/route.js` – PDF generation endpoint

## Print Requirements

- 300dpi resolution, CMYK color
- 3mm bleed on all products
- Professional cut and registration marks

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

*Internal use only. No authentication or order management
