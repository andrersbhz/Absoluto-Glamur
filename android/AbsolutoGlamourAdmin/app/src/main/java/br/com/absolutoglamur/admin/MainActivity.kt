package br.com.absolutoglamur.admin

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.FrameLayout
import android.widget.TextView
import android.graphics.Color

/**
 * Isolated Android container for the existing authenticated store dashboard.
 * No bank credentials, no third-party payment SDK, no new user account.
 * Sound in the dashboard only plays after user enables it, while app is visible.
 */
class MainActivity : Activity() {
 private lateinit var web: WebView
 private val storeHost = "absolutoglamur.com.br"
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  window.statusBarColor = Color.rgb(13,18,14)
  window.navigationBarColor = Color.rgb(13,18,14)
  web = WebView(this)
  web.setBackgroundColor(Color.rgb(13,18,14))
  web.settings.javaScriptEnabled = true
  web.settings.domStorageEnabled = true
  web.settings.allowFileAccess = false
  web.settings.allowContentAccess = false
  web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
  web.settings.setSupportMultipleWindows(false)
  CookieManager.getInstance().setAcceptCookie(true)
  CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
  web.webViewClient = object : WebViewClient() {
   override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    val uri=request.url
    // Never navigate to untrusted domains inside this authenticated container.
    return !(uri.scheme=="https" && (uri.host==storeHost || uri.host=="www.$storeHost"))
   }
  }
  setContentView(web)
  if(savedInstanceState == null) web.loadUrl("https://absolutoglamur.com.br/admin/manual-pix")
  else web.restoreState(savedInstanceState)
 }
 override fun onSaveInstanceState(outState: Bundle) {
  web.saveState(outState)
  super.onSaveInstanceState(outState)
 }
 override fun onPause() { web.onPause();super.onPause() }
 override fun onResume() { super.onResume();web.onResume() }
 @Deprecated("Deprecated in Java")
 override fun onBackPressed() { if(web.canGoBack()) web.goBack() else super.onBackPressed() }
 override fun onDestroy() { web.destroy();super.onDestroy() }
}
