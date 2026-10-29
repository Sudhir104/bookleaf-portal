// BookLeaf Knowledge Base, split into small sections so each AI call only
// receives what it needs (token/cost control). Source: assignment brief.

export const COMPANY = `BookLeaf Publishing: self-publishing company in India and the US. Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid; marketing and distribution add-ons). We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management. In-house printing facility and warehouse in Delhi; print partners Repro India and Epitome Books.`;

export const TONE = `- Empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the concern first, then give solutions.
- Be specific: use real numbers, dates and statuses instead of vague reassurance.
- If it is BookLeaf's fault (delayed royalty, ISBN error), own it directly. No corporate deflection. Never blame the author, even if the delay is on their side; frame it collaboratively.
- If it needs escalation or investigation, give a clear timeline (e.g. "within 48 hours"), never open-ended promises.
- Always end with one clear next step for the author and/or the BookLeaf team.`;

// Policy text per category (only the matching one is sent to the model)
export const POLICY = {
  'Royalty & Payments': `- 80/20 split: 80% of net profit per book to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of quarter end.
- Minimum payout threshold Rs 1,000; below it, royalties roll over to the next quarter.
- Payouts go by bank transfer to the account linked in the author dashboard.
- Authors can see a per-platform royalty breakdown in their dashboard; we can also share a detailed line-by-line breakdown.`,

  'ISBN & Metadata Issues': `- Every book gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint. An author wanting an ISBN under their own imprint must obtain it independently.
- ISBN errors (duplicate, wrong book linked) are HIGH priority and escalated to the production team immediately.
- Metadata updates (description etc.) can be submitted via the dashboard or by emailing the BookLeaf team; changes reflect on platforms in 3-5 business days.`,

  'Printing & Quality': `- In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy.`,

  'Distribution & Availability': `- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings go live 7-10 business days after publication is complete.
- A book showing "unavailable" on a platform is usually a stock sync issue; BookLeaf can trigger a re-sync, live again within 24-48 hours.`,

  'Book Status & Production Updates': `- Production stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Authors get an email at each stage. Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).
- New listings go live 7-10 business days after publication is complete.`,

  'General Inquiry': `- Metadata updates (e.g. book description on Amazon) can be submitted via the dashboard or by emailing the BookLeaf team; they reflect on platforms in 3-5 business days.
- Own-imprint ISBNs must be obtained independently by the author.`,
};

// One short example per category, used as a style reference (few-shot) for tone + structure
export const EXAMPLES = {
  'Royalty & Payments': {
    q: 'I published my book 4 months ago and still have not received any royalty.',
    a: `Dear Author,\n\nI understand how frustrating it is to wait on royalties, and I'm sorry for the worry this has caused. Royalties are calculated quarterly and paid within 45 days of each quarter's end, so your first payout is due by <date from FACTS>. I'm checking that your bank details are linked in your dashboard. If the payment is overdue on our side, I'll escalate it today and you will hear from us within 48 hours.\n\nNext step: please confirm your bank details in the dashboard; we will update you within 48 hours.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
  'ISBN & Metadata Issues': {
    q: 'My book shows a different ISBN on Amazon than on the physical copy.',
    a: `Dear Author,\n\nThank you for flagging this. A mismatched ISBN is a serious data issue and we treat it as high priority. I am escalating it to our production team right now so they can check which ISBN is registered against your title. You will have a resolution update within 48 hours.\n\nNext step: please send a photo of the ISBN on the physical copy and the Amazon listing link.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
  'Printing & Quality': {
    q: 'My author copies arrived with blurry images and misaligned pages.',
    a: `Dear Author,\n\nI'm sincerely sorry your copies arrived like this; that is not the quality we stand for. We will arrange a free reprint once we verify the defect. Could you share photos of the blurry images and the misaligned pages? After verification, the reprint takes 5-7 business days.\n\nNext step: reply with photos of the affected pages and we'll start the reprint.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
  'Distribution & Availability': {
    q: 'My book is published but shows Currently Unavailable on Amazon.',
    a: `Dear Author,\n\nThanks for letting us know, and sorry for the disruption to your sales. This is usually a stock sync issue. I'm asking our distribution team to trigger a re-sync now; your book should be live again within 24-48 hours.\n\nNext step: we will confirm once the listing is back; tell us if it still shows unavailable after 48 hours.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
  'Book Status & Production Updates': {
    q: 'It has been 3 weeks and my book is still in typesetting. When will it be done?',
    a: `Dear Author,\n\nThank you for checking in; I know waiting is hard when you're excited to see your book out. Your book is currently in <stage from FACTS>. <Honest reason for the delay, framed collaboratively>. Based on where it stands, the next milestone is <specific date or timeline>.\n\nNext step: <what the author or the team needs to do next>.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
  'General Inquiry': {
    q: 'Can I update the description of my book on Amazon after it is live?',
    a: `Dear Author,\n\nYes, you can. Please submit the updated description through your dashboard or email it to our team. Changes usually reflect on the platforms within 3-5 business days.\n\nNext step: send us the new text and we will confirm once it is submitted.\n\nWarm regards,\nBookLeaf Author Support Team`,
  },
};
