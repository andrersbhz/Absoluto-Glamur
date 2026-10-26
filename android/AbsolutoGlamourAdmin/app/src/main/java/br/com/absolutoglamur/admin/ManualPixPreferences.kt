package br.com.absolutoglamur.admin

import android.content.Context

/** Device-only non-sensitive preferences. No Pix key, password or access token. */
class ManualPixPreferences(context: Context) {
 private val prefs = context.getSharedPreferences("manual_pix_ui", Context.MODE_PRIVATE)
 var soundEnabled: Boolean
  get() = prefs.getBoolean("sound_enabled", true)
  set(value) { prefs.edit().putBoolean("sound_enabled", value).apply() }
 var vibrationEnabled: Boolean
  get() = prefs.getBoolean("vibration_enabled", true)
  set(value) { prefs.edit().putBoolean("vibration_enabled", value).apply() }
}
