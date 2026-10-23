import { buildPdf } from './pdf';

describe('buildPdf', () => {
  it('renders every block kind, including text the standard fonts cannot encode', async () => {
    const buf = await buildPdf({
      school: 'Sainik School',
      schoolLine: 'New Delhi',
      title: 'Fee Receipt — Term 1',
      reference: 'RCPT-2026-0001',
      blocks: [
        { kind: 'heading', text: 'Student' },
        { kind: 'fields', rows: [['Name', 'Aditya “Adi” Singh'], ['Amount', '₹25,000'], ['Class', '10 A']] },
        { kind: 'table', head: ['Item', 'Amount'], rows: [['Tuition fee with a description far too long for its column', 20000], ['Hostel', 5000]] },
        { kind: 'text', text: 'Thank you. '.repeat(400) }, // forces a page break
        { kind: 'signature', name: 'Brig. Anil Kapoor', title: 'Principal', signedAt: '2026-10-21' },
      ],
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});
