package br.com.absolutoglamur.admin

/**
 * Pure policy: sound only for genuinely new payment IDs, not previously known ones.
 * The initial sync establishes the baseline and intentionally does not ring.
 * Payment creation != receipt of funds.
 */
class PaymentAlertPolicy {
 private var seen: Set<String>? = null
 fun onSnapshot(pendingIds: Set<String>): Int {
  val previous = seen
  seen = pendingIds.toSet()
  return if (previous == null) 0 else (pendingIds - previous).size
 }
 fun clear() { seen = null }
}
