const PDFDocument = require('pdfkit');
const fs = require('fs');

test('PDF generation handles missing font gracefully', () => {
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream('output.pdf');

    doc.pipe(writeStream);

    expect(() => {
        doc.font('Helvetica.afm').text('Hello World');
    }).toThrowError(/ENOENT/);

    doc.end();
});