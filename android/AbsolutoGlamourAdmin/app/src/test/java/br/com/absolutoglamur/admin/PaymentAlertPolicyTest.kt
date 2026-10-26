package br.com.absolutoglamur.admin

import org.junit.Assert.assertEquals
import org.junit.Test

class PaymentAlertPolicyTest {
 @Test fun firstSyncDoesNotRingForOlderOrders() {
  val policy = PaymentAlertPolicy()
  assertEquals(0, policy.onSnapshot(setOf("p1", "p2")))
 }
 @Test fun onlyNewChargeRingsOnce() {
  val policy = PaymentAlertPolicy()
  policy.onSnapshot(setOf("p1"))
  assertEquals(1, policy.onSnapshot(setOf("p1", "p2")))
  assertEquals(0, policy.onSnapshot(setOf("p1", "p2")))
 }
 @Test fun removedChargeDoesNotRing() {
  val policy = PaymentAlertPolicy()
  policy.onSnapshot(setOf("p1", "p2"))
  assertEquals(0, policy.onSnapshot(setOf("p2")))
 }
 @Test fun resetDoesNotReannounceOldOrders() {
  val policy = PaymentAlertPolicy()
  policy.onSnapshot(setOf("p1"))
  policy.clear()
  assertEquals(0, policy.onSnapshot(setOf("p1", "p2")))
 }
}
