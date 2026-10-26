package br.com.absolutoglamur.admin

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.CookieManager
import android.content.Intent
import android.net.Uri

/** Standalone Android shell for the store's authenticated manual-review dashboard.
 * No bank API, payment service, Firebase project or additional login provider.
 * Alerts refresh while this view is open. Background notifications are NOT implemented.
 */
class MainActivity : Activity() {
 private lateinit var web: WebView
 private val allowedHost = "absolutoglamur.com.br"
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  web = WebView(this)
  web.settings.javaScriptEnabled = true
  web.settings.domStorageEnabled = true
  web.settings.allowFileAccess = false
  web.settings.allowContentAccess = false
  CookieManager.getInstance().setAcceptCookie(true)
  web.webViewClient = object : WebViewClient() {
   override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    val uri = request.url
    if(uri.scheme == "https" && (uri.host == allowedHost || uri.host == "www.$allowedHost")) return false
    startActivity(Intent(Intent.ACTION_VIEW, uri))
    return true
   }
  }
  setContentView(web)
  web.loadUrl("https://absolutoglamur.com.br/admin/manual-pix")
 }
 @Deprecated("Deprecated in Java")
 override fun onBackPressed() {
  if(web.canGoBack()) web.goBack() else super.onBackPressed()
 }
 override fun onDestroy() { web.destroy(); super.onDestroy() }
}
