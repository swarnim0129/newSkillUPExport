const Candidate = require('../models/Candidate');

/**
 * Work out how a paid action would be covered, without charging yet.
 * `freeFlag` is the Candidate field that records a used free pass.
 */
function quoteCharge(candidate, { freeFlag, cost, alwaysPaid = false }) {
  if (!alwaysPaid && freeFlag && !candidate[freeFlag]) {
    return { ok: true, useFree: true, cost: 0, freeFlag };
  }
  if ((candidate.credits || 0) < cost) {
    return { ok: false, useFree: false, cost, freeFlag: null };
  }
  return { ok: true, useFree: false, cost, freeFlag: null };
}

/**
 * Apply a quote atomically. Returns the updated candidate, or null when a
 * concurrent request already used the free pass or spent the credits.
 */
async function applyCharge(candidateId, quote) {
  if (quote.useFree) {
    return Candidate.findOneAndUpdate(
      { _id: candidateId, [quote.freeFlag]: { $ne: true } },
      { $set: { [quote.freeFlag]: true } },
      { new: true }
    );
  }
  return Candidate.findOneAndUpdate(
    { _id: candidateId, credits: { $gte: quote.cost } },
    { $inc: { credits: -quote.cost } },
    { new: true }
  );
}

/**
 * Undo a charge when the paid work did not complete.
 */
async function refundCharge(candidateId, quote) {
  try {
    if (quote.useFree) {
      await Candidate.updateOne({ _id: candidateId }, { $set: { [quote.freeFlag]: false } });
    } else if (quote.cost > 0) {
      await Candidate.updateOne({ _id: candidateId }, { $inc: { credits: quote.cost } });
    }
  } catch (err) {
    console.error('[credits] Refund failed:', err.message);
  }
}

module.exports = { quoteCharge, applyCharge, refundCharge };
