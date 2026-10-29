// Keyword rules used ONLY when the AI is unavailable, so the admin queue is still
// sorted sensibly instead of every ticket being unclassified.
const RULES = [
  { category: 'ISBN & Metadata Issues', re: /\bisbn\b|barcode|wrong book|duplicate/i, priority: 'High' },
  { category: 'Royalty & Payments', re: /royalt|payment|payout|paid|bank|earning|commission/i, priority: 'High' },
  { category: 'Printing & Quality', re: /print|blurry|misprint|binding|misalign|quality|damaged|defect|reprint/i, priority: 'High' },
  { category: 'Distribution & Availability', re: /unavailable|not showing|out of stock|amazon|flipkart|listing|listed|available/i, priority: 'High' },
  { category: 'Book Status & Production Updates', re: /typeset|cover design|proof|editing|production|when will|status|stuck/i, priority: 'Medium' },
];
const URGENT = /urgent|asap|immediately|months|never received|still not|legal|refund|scam|fraud/i;

export function fallbackClassify(subject, description) {
  const text = `${subject} ${description}`;
  const hit = RULES.find((r) => r.re.test(text));
  const category = hit?.category || 'General Inquiry';
  let priority = hit?.priority || 'Low';
  if (URGENT.test(text) && hit) priority = 'Critical';
  return { category, priority, reason: 'Keyword rules (AI unavailable)' };
}
